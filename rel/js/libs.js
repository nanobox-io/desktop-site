
/* **********************************************
     Begin prism-core.js
********************************************** */

self = (typeof window !== 'undefined')
	? window   // if in browser
	: (
		(typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope)
		? self // if in worker
		: {}   // if in node js
	);

/**
 * Prism: Lightweight, robust, elegant syntax highlighting
 * MIT license http://www.opensource.org/licenses/mit-license.php/
 * @author Lea Verou http://lea.verou.me
 */

var Prism = (function(){

// Private helper vars
var lang = /\blang(?:uage)?-(?!\*)(\w+)\b/i;

var _ = self.Prism = {
	util: {
		encode: function (tokens) {
			if (tokens instanceof Token) {
				return new Token(tokens.type, _.util.encode(tokens.content), tokens.alias);
			} else if (_.util.type(tokens) === 'Array') {
				return tokens.map(_.util.encode);
			} else {
				return tokens.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\u00a0/g, ' ');
			}
		},

		type: function (o) {
			return Object.prototype.toString.call(o).match(/\[object (\w+)\]/)[1];
		},

		// Deep clone a language definition (e.g. to extend it)
		clone: function (o) {
			var type = _.util.type(o);

			switch (type) {
				case 'Object':
					var clone = {};

					for (var key in o) {
						if (o.hasOwnProperty(key)) {
							clone[key] = _.util.clone(o[key]);
						}
					}

					return clone;

				case 'Array':
					return o.map(function(v) { return _.util.clone(v); });
			}

			return o;
		}
	},

	languages: {
		extend: function (id, redef) {
			var lang = _.util.clone(_.languages[id]);

			for (var key in redef) {
				lang[key] = redef[key];
			}

			return lang;
		},

		/**
		 * Insert a token before another token in a language literal
		 * As this needs to recreate the object (we cannot actually insert before keys in object literals),
		 * we cannot just provide an object, we need anobject and a key.
		 * @param inside The key (or language id) of the parent
		 * @param before The key to insert before. If not provided, the function appends instead.
		 * @param insert Object with the key/value pairs to insert
		 * @param root The object that contains `inside`. If equal to Prism.languages, it can be omitted.
		 */
		insertBefore: function (inside, before, insert, root) {
			root = root || _.languages;
			var grammar = root[inside];
			
			if (arguments.length == 2) {
				insert = arguments[1];
				
				for (var newToken in insert) {
					if (insert.hasOwnProperty(newToken)) {
						grammar[newToken] = insert[newToken];
					}
				}
				
				return grammar;
			}
			
			var ret = {};

			for (var token in grammar) {

				if (grammar.hasOwnProperty(token)) {

					if (token == before) {

						for (var newToken in insert) {

							if (insert.hasOwnProperty(newToken)) {
								ret[newToken] = insert[newToken];
							}
						}
					}

					ret[token] = grammar[token];
				}
			}
			
			// Update references in other language definitions
			_.languages.DFS(_.languages, function(key, value) {
				if (value === root[inside] && key != inside) {
					this[key] = ret;
				}
			});

			return root[inside] = ret;
		},

		// Traverse a language definition with Depth First Search
		DFS: function(o, callback, type) {
			for (var i in o) {
				if (o.hasOwnProperty(i)) {
					callback.call(o, i, o[i], type || i);

					if (_.util.type(o[i]) === 'Object') {
						_.languages.DFS(o[i], callback);
					}
					else if (_.util.type(o[i]) === 'Array') {
						_.languages.DFS(o[i], callback, i);
					}
				}
			}
		}
	},

	highlightAll: function(async, callback) {
		var elements = document.querySelectorAll('code[class*="language-"], [class*="language-"] code, code[class*="lang-"], [class*="lang-"] code');

		for (var i=0, element; element = elements[i++];) {
			_.highlightElement(element, async === true, callback);
		}
	},

	highlightElement: function(element, async, callback) {
		// Find language
		var language, grammar, parent = element;

		while (parent && !lang.test(parent.className)) {
			parent = parent.parentNode;
		}

		if (parent) {
			language = (parent.className.match(lang) || [,''])[1];
			grammar = _.languages[language];
		}

		if (!grammar) {
			return;
		}

		// Set language on the element, if not present
		element.className = element.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;

		// Set language on the parent, for styling
		parent = element.parentNode;

		if (/pre/i.test(parent.nodeName)) {
			parent.className = parent.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;
		}

		var code = element.textContent;

		if(!code) {
			return;
		}

		code = code.replace(/^(?:\r?\n|\r)/,'');

		var env = {
			element: element,
			language: language,
			grammar: grammar,
			code: code
		};

		_.hooks.run('before-highlight', env);

		if (async && self.Worker) {
			var worker = new Worker(_.filename);

			worker.onmessage = function(evt) {
				env.highlightedCode = Token.stringify(JSON.parse(evt.data), language);

				_.hooks.run('before-insert', env);

				env.element.innerHTML = env.highlightedCode;

				callback && callback.call(env.element);
				_.hooks.run('after-highlight', env);
			};

			worker.postMessage(JSON.stringify({
				language: env.language,
				code: env.code
			}));
		}
		else {
			env.highlightedCode = _.highlight(env.code, env.grammar, env.language);

			_.hooks.run('before-insert', env);

			env.element.innerHTML = env.highlightedCode;

			callback && callback.call(element);

			_.hooks.run('after-highlight', env);
		}
	},

	highlight: function (text, grammar, language) {
		var tokens = _.tokenize(text, grammar);
		return Token.stringify(_.util.encode(tokens), language);
	},

	tokenize: function(text, grammar, language) {
		var Token = _.Token;

		var strarr = [text];

		var rest = grammar.rest;

		if (rest) {
			for (var token in rest) {
				grammar[token] = rest[token];
			}

			delete grammar.rest;
		}

		tokenloop: for (var token in grammar) {
			if(!grammar.hasOwnProperty(token) || !grammar[token]) {
				continue;
			}

			var patterns = grammar[token];
			patterns = (_.util.type(patterns) === "Array") ? patterns : [patterns];

			for (var j = 0; j < patterns.length; ++j) {
				var pattern = patterns[j],
					inside = pattern.inside,
					lookbehind = !!pattern.lookbehind,
					lookbehindLength = 0,
					alias = pattern.alias;

				pattern = pattern.pattern || pattern;

				for (var i=0; i<strarr.length; i++) { // Don’t cache length as it changes during the loop

					var str = strarr[i];

					if (strarr.length > text.length) {
						// Something went terribly wrong, ABORT, ABORT!
						break tokenloop;
					}

					if (str instanceof Token) {
						continue;
					}

					pattern.lastIndex = 0;

					var match = pattern.exec(str);

					if (match) {
						if(lookbehind) {
							lookbehindLength = match[1].length;
						}

						var from = match.index - 1 + lookbehindLength,
							match = match[0].slice(lookbehindLength),
							len = match.length,
							to = from + len,
							before = str.slice(0, from + 1),
							after = str.slice(to + 1);

						var args = [i, 1];

						if (before) {
							args.push(before);
						}

						var wrapped = new Token(token, inside? _.tokenize(match, inside) : match, alias);

						args.push(wrapped);

						if (after) {
							args.push(after);
						}

						Array.prototype.splice.apply(strarr, args);
					}
				}
			}
		}

		return strarr;
	},

	hooks: {
		all: {},

		add: function (name, callback) {
			var hooks = _.hooks.all;

			hooks[name] = hooks[name] || [];

			hooks[name].push(callback);
		},

		run: function (name, env) {
			var callbacks = _.hooks.all[name];

			if (!callbacks || !callbacks.length) {
				return;
			}

			for (var i=0, callback; callback = callbacks[i++];) {
				callback(env);
			}
		}
	}
};

var Token = _.Token = function(type, content, alias) {
	this.type = type;
	this.content = content;
	this.alias = alias;
};

Token.stringify = function(o, language, parent) {
	if (typeof o == 'string') {
		return o;
	}

	if (_.util.type(o) === 'Array') {
		return o.map(function(element) {
			return Token.stringify(element, language, o);
		}).join('');
	}

	var env = {
		type: o.type,
		content: Token.stringify(o.content, language, parent),
		tag: 'span',
		classes: ['token', o.type],
		attributes: {},
		language: language,
		parent: parent
	};

	if (env.type == 'comment') {
		env.attributes['spellcheck'] = 'true';
	}

	if (o.alias) {
		var aliases = _.util.type(o.alias) === 'Array' ? o.alias : [o.alias];
		Array.prototype.push.apply(env.classes, aliases);
	}

	_.hooks.run('wrap', env);

	var attributes = '';

	for (var name in env.attributes) {
		attributes += name + '="' + (env.attributes[name] || '') + '"';
	}

	return '<' + env.tag + ' class="' + env.classes.join(' ') + '" ' + attributes + '>' + env.content + '</' + env.tag + '>';

};

if (!self.document) {
	if (!self.addEventListener) {
		// in Node.js
		return self.Prism;
	}
 	// In worker
	self.addEventListener('message', function(evt) {
		var message = JSON.parse(evt.data),
		    lang = message.language,
		    code = message.code;

		self.postMessage(JSON.stringify(_.util.encode(_.tokenize(code, _.languages[lang]))));
		self.close();
	}, false);

	return self.Prism;
}

// Get current script and highlight
var script = document.getElementsByTagName('script');

script = script[script.length - 1];

if (script) {
	_.filename = script.src;

	if (document.addEventListener && !script.hasAttribute('data-manual')) {
		document.addEventListener('DOMContentLoaded', _.highlightAll);
	}
}

return self.Prism;

})();

if (typeof module !== 'undefined' && module.exports) {
	module.exports = Prism;
}


/* **********************************************
     Begin prism-markup.js
********************************************** */

Prism.languages.markup = {
	'comment': /<!--[\w\W]*?-->/,
	'prolog': /<\?.+?\?>/,
	'doctype': /<!DOCTYPE.+?>/,
	'cdata': /<!\[CDATA\[[\w\W]*?]]>/i,
	'tag': {
		pattern: /<\/?[\w:-]+\s*(?:\s+[\w:-]+(?:=(?:("|')(\\?[\w\W])*?\1|[^\s'">=]+))?\s*)*\/?>/i,
		inside: {
			'tag': {
				pattern: /^<\/?[\w:-]+/i,
				inside: {
					'punctuation': /^<\/?/,
					'namespace': /^[\w-]+?:/
				}
			},
			'attr-value': {
				pattern: /=(?:('|")[\w\W]*?(\1)|[^\s>]+)/i,
				inside: {
					'punctuation': /=|>|"/
				}
			},
			'punctuation': /\/?>/,
			'attr-name': {
				pattern: /[\w:-]+/,
				inside: {
					'namespace': /^[\w-]+?:/
				}
			}

		}
	},
	'entity': /&#?[\da-z]{1,8};/i
};

// Plugin to make entity title show the real entity, idea by Roman Komarov
Prism.hooks.add('wrap', function(env) {

	if (env.type === 'entity') {
		env.attributes['title'] = env.content.replace(/&amp;/, '&');
	}
});


/* **********************************************
     Begin prism-css.js
********************************************** */

Prism.languages.css = {
	'comment': /\/\*[\w\W]*?\*\//,
	'atrule': {
		pattern: /@[\w-]+?.*?(;|(?=\s*\{))/i,
		inside: {
			'punctuation': /[;:]/
		}
	},
	'url': /url\((?:(["'])(\\\n|\\?.)*?\1|.*?)\)/i,
	'selector': /[^\{\}\s][^\{\};]*(?=\s*\{)/,
	'string': /("|')(\\\n|\\?.)*?\1/,
	'property': /(\b|\B)[\w-]+(?=\s*:)/i,
	'important': /\B!important\b/i,
	'punctuation': /[\{\};:]/,
	'function': /[-a-z0-9]+(?=\()/i
};

if (Prism.languages.markup) {
	Prism.languages.insertBefore('markup', 'tag', {
		'style': {
			pattern: /<style[\w\W]*?>[\w\W]*?<\/style>/i,
			inside: {
				'tag': {
					pattern: /<style[\w\W]*?>|<\/style>/i,
					inside: Prism.languages.markup.tag.inside
				},
				rest: Prism.languages.css
			},
			alias: 'language-css'
		}
	});
	
	Prism.languages.insertBefore('inside', 'attr-value', {
		'style-attr': {
			pattern: /\s*style=("|').*?\1/i,
			inside: {
				'attr-name': {
					pattern: /^\s*style/i,
					inside: Prism.languages.markup.tag.inside
				},
				'punctuation': /^\s*=\s*['"]|['"]\s*$/,
				'attr-value': {
					pattern: /.+/i,
					inside: Prism.languages.css
				}
			},
			alias: 'language-css'
		}
	}, Prism.languages.markup.tag);
}

/* **********************************************
     Begin prism-clike.js
********************************************** */

Prism.languages.clike = {
	'comment': [
		{
			pattern: /(^|[^\\])\/\*[\w\W]*?\*\//,
			lookbehind: true
		},
		{
			pattern: /(^|[^\\:])\/\/.+/,
			lookbehind: true
		}
	],
	'string': /("|')(\\\n|\\?.)*?\1/,
	'class-name': {
		pattern: /((?:(?:class|interface|extends|implements|trait|instanceof|new)\s+)|(?:catch\s+\())[a-z0-9_\.\\]+/i,
		lookbehind: true,
		inside: {
			punctuation: /(\.|\\)/
		}
	},
	'keyword': /\b(if|else|while|do|for|return|in|instanceof|function|new|try|throw|catch|finally|null|break|continue)\b/,
	'boolean': /\b(true|false)\b/,
	'function': {
		pattern: /[a-z0-9_]+\(/i,
		inside: {
			punctuation: /\(/
		}
	},
	'number': /\b-?(0x[\dA-Fa-f]+|\d*\.?\d+([Ee]-?\d+)?)\b/,
	'operator': /[-+]{1,2}|!|<=?|>=?|={1,3}|&{1,2}|\|?\||\?|\*|\/|~|\^|%/,
	'ignore': /&(lt|gt|amp);/i,
	'punctuation': /[{}[\];(),.:]/
};


/* **********************************************
     Begin prism-javascript.js
********************************************** */

Prism.languages.javascript = Prism.languages.extend('clike', {
	'keyword': /\b(break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|function|get|if|implements|import|in|instanceof|interface|let|new|null|package|private|protected|public|return|set|static|super|switch|this|throw|true|try|typeof|var|void|while|with|yield)\b/,
	'number': /\b-?(0x[\dA-Fa-f]+|\d*\.?\d+([Ee][+-]?\d+)?|NaN|-?Infinity)\b/,
	'function': /(?!\d)[a-z0-9_$]+(?=\()/i
});

Prism.languages.insertBefore('javascript', 'keyword', {
	'regex': {
		pattern: /(^|[^/])\/(?!\/)(\[.+?]|\\.|[^/\r\n])+\/[gim]{0,3}(?=\s*($|[\r\n,.;})]))/,
		lookbehind: true
	}
});

if (Prism.languages.markup) {
	Prism.languages.insertBefore('markup', 'tag', {
		'script': {
			pattern: /<script[\w\W]*?>[\w\W]*?<\/script>/i,
			inside: {
				'tag': {
					pattern: /<script[\w\W]*?>|<\/script>/i,
					inside: Prism.languages.markup.tag.inside
				},
				rest: Prism.languages.javascript
			},
			alias: 'language-javascript'
		}
	});
}


/* **********************************************
     Begin prism-file-highlight.js
********************************************** */

(function () {
	if (!self.Prism || !self.document || !document.querySelector) {
		return;
	}

	self.Prism.fileHighlight = function() {

		var Extensions = {
			'js': 'javascript',
			'html': 'markup',
			'svg': 'markup',
			'xml': 'markup',
			'py': 'python',
			'rb': 'ruby',
			'ps1': 'powershell',
			'psm1': 'powershell'
		};

		Array.prototype.slice.call(document.querySelectorAll('pre[data-src]')).forEach(function(pre) {
			var src = pre.getAttribute('data-src');
			var extension = (src.match(/\.(\w+)$/) || [,''])[1];
			var language = Extensions[extension] || extension;

			var code = document.createElement('code');
			code.className = 'language-' + language;

			pre.textContent = '';

			code.textContent = 'Loading…';

			pre.appendChild(code);

			var xhr = new XMLHttpRequest();

			xhr.open('GET', src, true);

			xhr.onreadystatechange = function() {
				if (xhr.readyState == 4) {

					if (xhr.status < 400 && xhr.responseText) {
						code.textContent = xhr.responseText;

						Prism.highlightElement(code);
					}
					else if (xhr.status >= 400) {
						code.textContent = '✖ Error ' + xhr.status + ' while fetching file: ' + xhr.statusText;
					}
					else {
						code.textContent = '✖ Error: File does not exist or is empty';
					}
				}
			};

			xhr.send(null);
		});

	};

	self.Prism.fileHighlight();

})();

Prism.languages.nanobox = {
  // 'comment': /\.*/g
  'command'  : /nanobox|rake/g,
  'parameter': /up|enter|test/g,
  'prompt'   : /\$/g,
  'comment'  : /\#.+/g,
};

/*
Copyright (c) 2010,2011,2012,2013,2014 Morgan Roderick http://roderick.dk
License: MIT - http://mrgnrdrck.mit-license.org

https://github.com/mroderick/PubSubJS
*/
(function (root, factory){
	'use strict';

    if (typeof define === 'function' && define.amd){
        // AMD. Register as an anonymous module.
        define(['exports'], factory);

    } else if (typeof exports === 'object'){
        // CommonJS
        factory(exports);

    } else {
        // Browser globals
        var PubSub = {};
        root.PubSub = PubSub;
        factory(PubSub);
    }
}(( typeof window === 'object' && window ) || this, function (PubSub){
	'use strict';

	var messages = {},
		lastUid = -1;

	function hasKeys(obj){
		var key;

		for (key in obj){
			if ( obj.hasOwnProperty(key) ){
				return true;
			}
		}
		return false;
	}

	/**
	 *	Returns a function that throws the passed exception, for use as argument for setTimeout
	 *	@param { Object } ex An Error object
	 */
	function throwException( ex ){
		return function reThrowException(){
			throw ex;
		};
	}

	function callSubscriberWithDelayedExceptions( subscriber, message, data ){
		try {
			subscriber( message, data );
		} catch( ex ){
			setTimeout( throwException( ex ), 0);
		}
	}

	function callSubscriberWithImmediateExceptions( subscriber, message, data ){
		subscriber( message, data );
	}

	function deliverMessage( originalMessage, matchedMessage, data, immediateExceptions ){
		var subscribers = messages[matchedMessage],
			callSubscriber = immediateExceptions ? callSubscriberWithImmediateExceptions : callSubscriberWithDelayedExceptions,
			s;

		if ( !messages.hasOwnProperty( matchedMessage ) ) {
			return;
		}

		for (s in subscribers){
			if ( subscribers.hasOwnProperty(s)){
				callSubscriber( subscribers[s], originalMessage, data );
			}
		}
	}

	function createDeliveryFunction( message, data, immediateExceptions ){
		return function deliverNamespaced(){
			var topic = String( message ),
				position = topic.lastIndexOf( '.' );

			// deliver the message as it is now
			deliverMessage(message, message, data, immediateExceptions);

			// trim the hierarchy and deliver message to each level
			while( position !== -1 ){
				topic = topic.substr( 0, position );
				position = topic.lastIndexOf('.');
				deliverMessage( message, topic, data, immediateExceptions );
			}
		};
	}

	function messageHasSubscribers( message ){
		var topic = String( message ),
			found = Boolean(messages.hasOwnProperty( topic ) && hasKeys(messages[topic])),
			position = topic.lastIndexOf( '.' );

		while ( !found && position !== -1 ){
			topic = topic.substr( 0, position );
			position = topic.lastIndexOf( '.' );
			found = Boolean(messages.hasOwnProperty( topic ) && hasKeys(messages[topic]));
		}

		return found;
	}

	function publish( message, data, sync, immediateExceptions ){
		var deliver = createDeliveryFunction( message, data, immediateExceptions ),
			hasSubscribers = messageHasSubscribers( message );

		if ( !hasSubscribers ){
			return false;
		}

		if ( sync === true ){
			deliver();
		} else {
			setTimeout( deliver, 0 );
		}
		return true;
	}

	/**
	 *	PubSub.publish( message[, data] ) -> Boolean
	 *	- message (String): The message to publish
	 *	- data: The data to pass to subscribers
	 *	Publishes the the message, passing the data to it's subscribers
	**/
	PubSub.publish = function( message, data ){
		return publish( message, data, false, PubSub.immediateExceptions );
	};

	/**
	 *	PubSub.publishSync( message[, data] ) -> Boolean
	 *	- message (String): The message to publish
	 *	- data: The data to pass to subscribers
	 *	Publishes the the message synchronously, passing the data to it's subscribers
	**/
	PubSub.publishSync = function( message, data ){
		return publish( message, data, true, PubSub.immediateExceptions );
	};

	/**
	 *	PubSub.subscribe( message, func ) -> String
	 *	- message (String): The message to subscribe to
	 *	- func (Function): The function to call when a new message is published
	 *	Subscribes the passed function to the passed message. Every returned token is unique and should be stored if
	 *	you need to unsubscribe
	**/
	PubSub.subscribe = function( message, func ){
		if ( typeof func !== 'function'){
			return false;
		}

		// message is not registered yet
		if ( !messages.hasOwnProperty( message ) ){
			messages[message] = {};
		}

		// forcing token as String, to allow for future expansions without breaking usage
		// and allow for easy use as key names for the 'messages' object
		var token = 'uid_' + String(++lastUid);
		messages[message][token] = func;

		// return token for unsubscribing
		return token;
	};

	/* Public: Clears all subscriptions
	 */
	PubSub.clearAllSubscriptions = function clearAllSubscriptions(){
		messages = {};
	};

	/*Public: Clear subscriptions by the topic
	*/
	PubSub.clearSubscriptions = function clearSubscriptions(topic){
		var m; 
		for (m in messages){
			if (messages.hasOwnProperty(m) && m.indexOf(topic) === 0){
				delete messages[m];
			}
		}
	};

	/* Public: removes subscriptions.
	 * When passed a token, removes a specific subscription.
	 * When passed a function, removes all subscriptions for that function
	 * When passed a topic, removes all subscriptions for that topic (hierarchy)
	 *
	 * value - A token, function or topic to unsubscribe.
	 *
	 * Examples
	 *
	 *		// Example 1 - unsubscribing with a token
	 *		var token = PubSub.subscribe('mytopic', myFunc);
	 *		PubSub.unsubscribe(token);
	 *
	 *		// Example 2 - unsubscribing with a function
	 *		PubSub.unsubscribe(myFunc);
	 *
	 *		// Example 3 - unsubscribing a topic
	 *		PubSub.unsubscribe('mytopic');
	 */
	PubSub.unsubscribe = function(value){
		var isTopic    = typeof value === 'string' && messages.hasOwnProperty(value),
			isToken    = !isTopic && typeof value === 'string',
			isFunction = typeof value === 'function',
			result = false,
			m, message, t;

		if (isTopic){
			delete messages[value];
			return;
		}

		for ( m in messages ){
			if ( messages.hasOwnProperty( m ) ){
				message = messages[m];

				if ( isToken && message[value] ){
					delete message[value];
					result = value;
					// tokens are unique, so we can just stop here
					break;
				}

				if (isFunction) {
					for ( t in message ){
						if (message.hasOwnProperty(t) && message[t] === value){
							delete message[t];
							result = true;
						}
					}
				}
			}
		}

		return result;
	};
}));

var pxSymbolString = pxSymbolString || ''; pxSymbolString+='<symbol  id="Memcached" viewBox="-33 -33 66 66">	<g>		<g>			<path class="st92" d="M0,33c18.226,0,33-14.774,33-33S18.226-33,0-33S-33-18.226-33,0S-18.226,33,0,33z"/></g>		<path class="st109" d="M-0.633-21.581c14.18,0,19.127,10.196,19.127,17.047c0,6.854-1.742,16.839-10.994,26.093			c0-6.436-0.07-14.555-7.539-14.555"/><path class="st109" d="M0.55-21.581c-14.178,0-19.125,10.196-19.125,17.047c0,6.854,1.742,16.839,10.994,26.093			c0-6.436,0.07-14.555,7.541-14.555"/><g>			<path class="st109" d="M10.492,0.29c2.348,0,4.251-1.903,4.251-4.251s-1.903-4.251-4.251-4.251c-2.348,0-4.251,1.903-4.251,4.251				S8.145,0.29,10.492,0.29z"/></g>		<g>			<path class="st103" d="M10.492-0.204c2.076,0,3.762-1.681,3.762-3.757c0-2.079-1.686-3.762-3.762-3.762				c-2.076,0-3.76,1.684-3.76,3.762C6.732-1.885,8.416-0.204,10.492-0.204 M10.492,0.796c-2.625,0-4.76-2.134-4.76-4.757				c0-2.625,2.135-4.762,4.76-4.762s4.762,2.137,4.762,4.762C15.253-1.338,13.117,0.796,10.492,0.796L10.492,0.796z"/></g>		<polyline class="st81" points="0.52,-7.373 0.52,-14.711 -3.747,-18.842 		"/><line class="st81" x1="4.802" y1="-18.717" x2="0.52" y2="-14.295"/><g>			<path class="st109" d="M-9.391,0.289c2.347,0,4.25-1.902,4.25-4.25s-1.903-4.25-4.25-4.25c-2.348,0-4.25,1.902-4.25,4.25				S-11.738,0.289-9.391,0.289z"/></g>		<polygon class="st4" points="2.925,-6.736 0.55,-9.114 -1.829,-6.736 		"/><g>			<path class="st103" d="M-9.391-0.204c2.076,0,3.762-1.681,3.762-3.757c0-2.079-1.688-3.762-3.762-3.762				c-2.076,0-3.762,1.684-3.762,3.762C-13.151-1.885-11.467-0.204-9.391-0.204 M-9.391,0.796c-2.625,0-4.762-2.134-4.762-4.757				c0-2.625,2.137-4.762,4.762-4.762s4.762,2.137,4.762,4.762C-4.629-1.338-6.766,0.796-9.391,0.796L-9.391,0.796z"/></g>	</g></symbol><symbol  id="Mongo" viewBox="-32.5 -32.5 65 65">	<g>		<g>			<path class="st117" d="M0,32.5c17.949,0,32.5-14.551,32.5-32.5S17.949-32.5,0-32.5S-32.5-17.949-32.5,0S-17.949,32.5,0,32.5z"/></g>		<path class="st64" d="M-0.479,16.044"/><line class="st11" x1="-0.477" y1="-14.873" x2="-0.477" y2="-20.247"/><path class="st40" d="M-0.477,19.236v-34.863c0,0,9.072,6.298,9.072,16.632S-0.477,19.236-0.477,19.236z"/><path class="st130" d="M-0.477,19.236v-34.863c0,0-9.072,6.298-9.072,16.632S-0.477,19.236-0.477,19.236z"/></g></symbol><symbol  id="New_Symbol" viewBox="-137 -55.282 274 110.564">	<g>		<polyline class="st16" points="101.676,8.491 3.354,-43.639 -74.795,-3.876 		"/><polygon class="st10" points="-74.929,-6.312 -77.104,-2.674 -70.127,-3.583 		"/><polyline class="st16" points="101.676,-2.588 3.354,-54.718 -72.145,-15.984 		"/><polyline class="st16" points="68.623,1.726 3.354,-32.56 -35.783,-12.54 		"/><polygon class="st66" points="60.181,33.233 98.33,13.577 137,33.457 136.984,34.831 98.65,54.581 60.186,34.831 		"/><polygon class="st124" points="137,4.669 98.576,-15.103 97.177,-14.355 97.177,14.362 137,34.852 		"/><polygon class="st133" points="60.186,4.565 98.536,-15.133 98.536,15.134 60.186,34.831 		"/><polygon class="st173" points="-20.211,35.15 -98.056,-5.894 -137,14.256 -59.131,55.282 		"/><polygon class="st83" points="-20.211,4.239 -20.211,35.147 -98.056,-5.894 -98.058,-35.825 		"/><polygon class="st168" points="-98.056,-5.894 -137,14.256 -137,-15.841 -98.058,-35.825 		"/><polygon class="st108" points="-60.232,14.118 -64.649,11.816 -103.594,31.967 -99.154,34.251 		"/><polygon class="st172" points="-64.649,11.816 -60.232,14.118 -60.232,-16.286 -64.649,-18.588 		"/><polygon class="st108" points="-47.893,20.145 -52.309,17.843 -91.252,37.992 -86.812,40.276 		"/><polygon class="st172" points="-52.309,17.843 -47.893,20.145 -47.893,-10.261 -52.309,-12.562 		"/><polygon class="st108" points="-71.765,7.804 -76.181,5.503 -115.125,25.652 -110.686,27.937 		"/><polygon class="st172" points="-76.181,5.503 -71.765,7.804 -71.765,-22.601 -76.181,-24.902 		"/><polygon class="st66" points="-35.656,-15.119 -37.83,-11.482 -30.854,-12.392 		"/><polygon class="st109" points="131.906,31.689 129.229,30.335 90.285,50.484 92.984,51.821 		"/><polygon class="st109" points="129.229,30.335 131.906,31.689 131.906,1.284 129.229,-0.071 		"/><polygon class="st109" points="122.922,26.956 120.246,25.602 81.301,45.752 84.002,47.088 		"/><polygon class="st109" points="120.246,25.602 122.922,26.956 122.922,-3.449 120.246,-4.804 		"/><polygon class="st109" points="112.678,21.633 110,20.278 71.057,40.429 73.756,41.765 		"/><polygon class="st109" points="110,20.278 112.678,21.633 112.678,-8.772 110,-10.127 		"/></g></symbol><symbol  id="Ruby" viewBox="-32.304 -32.304 64.608 64.607">	<g>		<path class="st101" d="M0,32.304c17.841,0,32.304-14.463,32.304-32.304S17.841-32.304,0-32.304S-32.304-17.841-32.304,0			S-17.841,32.304,0,32.304z"/><polygon class="st100" points="0.01,-9.13 0.01,-20.523 16.742,-8.16 		"/><linearGradient id="SVGID_1_" gradientUnits="userSpaceOnUse" x1="-200.2515" y1="863.377" x2="-246.798" y2="888.3362" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#EC4A54"/><stop  offset="0.166" style="stop-color:#E84852"/><stop  offset="0.3386" style="stop-color:#DB434B"/><stop  offset="0.5143" style="stop-color:#C73A41"/><stop  offset="0.6919" style="stop-color:#A92E32"/><stop  offset="0.8695" style="stop-color:#841E1F"/><stop  offset="1" style="stop-color:#64100E"/></linearGradient>		<polygon class="st84" points="0.122,-7.854 0.091,-7.857 -17.46,-6.783 0.091,-20.458 0.122,-20.432 		"/><linearGradient id="SVGID_2_" gradientUnits="userSpaceOnUse" x1="-214.1421" y1="839.7227" x2="-225.6666" y2="895.6952" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#EC4A54"/><stop  offset="0.166" style="stop-color:#E84852"/><stop  offset="0.3386" style="stop-color:#DB434B"/><stop  offset="0.5143" style="stop-color:#C73A41"/><stop  offset="0.6919" style="stop-color:#A92E32"/><stop  offset="0.8695" style="stop-color:#841E1F"/><stop  offset="1" style="stop-color:#64100E"/></linearGradient>		<polygon class="st85" points="16.742,-8.16 7.263,3.018 -0.022,-9.134 		"/><polygon class="st57" points="7.263,3.018 15.042,8.117 16.742,-8.16 		"/><linearGradient id="SVGID_3_" gradientUnits="userSpaceOnUse" x1="-191.7178" y1="883.9502" x2="-220.118" y2="899.1796" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#EC4A54"/><stop  offset="0.166" style="stop-color:#E84852"/><stop  offset="0.3386" style="stop-color:#DB434B"/><stop  offset="0.5143" style="stop-color:#C73A41"/><stop  offset="0.6919" style="stop-color:#A92E32"/><stop  offset="0.8695" style="stop-color:#841E1F"/><stop  offset="1" style="stop-color:#64100E"/></linearGradient>		<polygon class="st86" points="16.742,-8.16 24.763,3.018 15.042,13.219 15.042,8.117 		"/><polygon class="st106" points="-16.786,-8.16 -7.312,3.018 -0.022,-9.134 		"/><polygon class="st57" points="-7.312,3.018 -15.083,8.117 -16.786,-8.16 		"/><polygon class="st57" points="-7.312,3.018 -15.083,8.117 -16.786,-8.16 		"/><linearGradient id="SVGID_4_" gradientUnits="userSpaceOnUse" x1="-250.3906" y1="887.8535" x2="-245.5871" y2="896.0101" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>		<polygon class="st87" points="-7.312,3.018 -15.083,8.117 -16.786,-8.16 		"/><polygon class="st136" points="-16.786,-7.188 -24.803,3.018 -15.083,13.219 -15.083,8.117 		"/><linearGradient id="SVGID_5_" gradientUnits="userSpaceOnUse" x1="-238.3208" y1="903.123" x2="-252.3942" y2="894.9139" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>		<polygon class="st88" points="-16.786,-7.188 -24.803,3.018 -15.083,13.219 -15.083,8.117 		"/><linearGradient id="SVGID_6_" gradientUnits="userSpaceOnUse" x1="-256.687" y1="892.0703" x2="-234.0122" y2="904.9344" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#61100D"/><stop  offset="0.1734" style="stop-color:#65100F;stop-opacity:0.8266"/><stop  offset="0.3537" style="stop-color:#721115;stop-opacity:0.6463"/><stop  offset="0.537" style="stop-color:#86131F;stop-opacity:0.463"/><stop  offset="0.7226" style="stop-color:#A4162D;stop-opacity:0.2774"/><stop  offset="0.9081" style="stop-color:#C9193F;stop-opacity:0.0919"/><stop  offset="1" style="stop-color:#DE1B49;stop-opacity:0"/></linearGradient>		<polygon class="st89" points="-16.72,-8.109 -24.803,3.018 -15.083,13.219 -15.083,8.117 		"/><linearGradient id="SVGID_7_" gradientUnits="userSpaceOnUse" x1="-237.9487" y1="897.752" x2="-229.5901" y2="892.2401" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#EB3842"/><stop  offset="1" style="stop-color:#AA1F26"/></linearGradient>		<polygon class="st90" points="-0.022,3.018 -7.312,3.018 -7.312,3.018 -0.022,-9.134 7.263,3.018 7.263,3.018 		"/><linearGradient id="SVGID_8_" gradientUnits="userSpaceOnUse" x1="-241.1274" y1="885.8828" x2="-228.9723" y2="898.2581" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0.42"/></linearGradient>		<polygon class="st91" points="-0.022,3.018 -7.312,3.018 -7.312,3.018 -0.022,-9.134 7.263,3.018 7.263,3.018 		"/><polygon class="st41" points="8.358,17.18 -0.022,17.18 -8.406,17.18 -15.083,13.219 -15.083,8.117 -7.312,3.018 -0.022,3.018 			7.263,3.018 15.042,8.117 15.042,13.219 		"/><linearGradient id="SVGID_9_" gradientUnits="userSpaceOnUse" x1="-211.8008" y1="929.3926" x2="-234.117" y2="902.6559" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>		<polygon class="st120" points="8.358,17.18 -0.022,17.18 -8.406,17.18 -15.083,13.219 -15.083,8.117 -7.312,3.018 -0.022,3.018 			7.263,3.018 15.042,8.117 15.042,13.219 		"/></g></symbol><symbol  id="YellowCode" viewBox="-120.858 -64.584 241.716 129.168">	<polygon class="st108" points="120.858,2.281 0,-60.017 -120.858,2.281 0,64.584 	"/><polygon class="st72" points="-67.758,12.41 -91.812,0.025 -96.1,2.285 -72.045,14.668 	"/><polygon class="st72" points="-42.021,17.811 -75.872,0.36 -80.157,2.619 -46.31,20.068 	"/><polygon class="st72" points="-34.375,13.869 -68.225,-3.58 -72.512,-1.324 -38.661,16.127 	"/><polygon class="st72" points="-26.726,9.926 -60.577,-7.524 -64.862,-5.266 -31.016,12.186 	"/><polygon class="st72" points="-32.846,-5.602 -56.899,-17.986 -61.185,-15.73 -37.129,-3.347 	"/><polygon class="st72" points="-7.106,-0.203 -40.959,-17.654 -45.245,-15.395 -11.396,2.056 	"/><polygon class="st72" points="0.539,-4.146 -33.312,-21.596 -37.6,-19.338 -3.75,-1.888 	"/><polygon class="st72" points="8.185,-8.088 -25.663,-25.537 -29.952,-23.281 3.897,-5.83 	"/><polygon class="st72" points="0.858,-22.973 -23.198,-35.356 -27.485,-33.101 -3.43,-20.716 	"/><polygon class="st72" points="26.597,-17.574 -7.256,-35.024 -11.545,-32.766 22.308,-15.315 	"/><polygon class="st72" points="34.242,-21.518 0.392,-38.967 -3.897,-36.707 29.955,-19.261 	"/><polygon class="st72" points="41.89,-25.457 8.035,-42.908 3.748,-40.651 37.601,-23.201 	"/><polygon class="st72" points="-13.715,40 -37.769,27.615 -42.059,29.873 -18.004,42.26 	"/><polygon class="st72" points="12.021,45.4 -21.829,27.95 -26.114,30.211 7.733,47.659 	"/><polygon class="st72" points="19.666,41.461 -14.182,24.01 -18.469,26.268 15.382,43.717 	"/><polygon class="st72" points="27.315,37.52 -6.536,20.066 -10.823,22.325 23.027,39.776 	"/><polygon class="st72" points="21.199,21.988 -2.854,9.604 -7.144,11.862 16.91,24.246 	"/><polygon class="st72" points="46.935,27.388 13.084,9.937 8.796,12.195 42.647,29.646 	"/><polygon class="st72" points="54.58,23.445 20.731,5.996 16.441,8.254 50.294,25.703 	"/><polygon class="st72" points="62.228,19.502 28.378,2.056 24.091,4.313 57.94,21.763 	"/><polygon class="st72" points="54.899,4.617 30.847,-7.768 26.56,-5.512 50.615,6.873 	"/><polygon class="st72" points="80.636,10.016 46.785,-7.435 42.498,-5.176 76.349,12.274 	"/><polygon class="st72" points="88.283,6.074 54.433,-11.375 50.146,-9.117 83.994,8.332 	"/><polygon class="st72" points="95.931,2.131 62.078,-15.315 57.791,-13.059 91.642,4.392 	"/><polygon class="st38" points="0,-60.017 120.858,2.281 120.858,-2.287 0,-64.584 	"/><polygon class="st172" points="0,-60.017 -120.858,2.281 -120.858,-2.287 0,-64.584 	"/></symbol><symbol  id="mini-stack_1_" viewBox="-43.885 -74.551 87.77 149.102">	<polygon class="st94" points="43.885,-45.754 0.515,-68.109 -43.885,-45.354 -0.518,-23 	"/><polygon class="st61" points="6.629,-50.784 -8.676,-58.825 -16.331,-54.878 -1.026,-46.842 	"/><polygon class="st25" points="-16.331,-54.83 -1.026,-46.791 -1.026,-52.094 -11.283,-57.48 	"/><polyline class="st36" points="-1.026,-46.791 -1.026,-52.094 1.562,-53.445 6.629,-50.784 	"/><polygon class="st61" points="-3.083,-45.751 -18.387,-53.791 -26.041,-49.846 -10.735,-41.809 	"/><polygon class="st25" points="-26.041,-49.795 -10.735,-41.757 -10.735,-47.061 -20.995,-52.446 	"/><polyline class="st36" points="-10.735,-41.757 -10.735,-47.061 -8.148,-48.411 -3.083,-45.751 	"/><polygon class="st61" points="-12.794,-40.666 -28.098,-48.707 -35.751,-44.761 -20.446,-36.725 	"/><polygon class="st25" points="-35.751,-44.712 -20.446,-36.674 -20.446,-41.976 -30.706,-47.362 	"/><polyline class="st36" points="-20.446,-36.674 -20.446,-41.976 -17.859,-43.327 -12.794,-40.666 	"/><polygon class="st36" points="0.515,-68.168 43.885,-45.814 43.885,-52.196 0.515,-74.551 	"/><polygon class="st25" points="0.515,-68.168 -43.885,-45.354 -43.885,-51.737 0.515,-74.551 	"/><polygon class="st61" points="31.076,-48.091 10.903,-58.582 3.252,-54.636 23.425,-44.147 	"/><polygon class="st25" points="3.254,-54.634 28.485,-41.442 28.485,-46.745 8.345,-57.267 	"/><polygon class="st61" points="26.458,-40.37 11.154,-48.41 3.501,-44.464 18.807,-36.426 	"/><polygon class="st25" points="3.501,-44.412 18.807,-36.378 18.807,-41.678 8.547,-47.063 	"/><polyline class="st36" points="18.807,-36.378 18.807,-41.678 21.393,-43.029 26.458,-40.37 	"/><polygon class="st61" points="16.745,-35.336 1.443,-43.376 -6.212,-39.429 9.094,-31.395 	"/><polygon class="st25" points="-6.212,-39.378 9.094,-31.343 9.094,-36.646 -1.165,-42.031 	"/><polyline class="st36" points="9.094,-31.343 9.094,-36.646 11.682,-37.998 16.745,-35.336 	"/><polygon class="st61" points="7.036,-30.253 -8.267,-38.291 -15.923,-34.346 -0.615,-26.31 	"/><polygon class="st25" points="-15.923,-34.295 -0.615,-26.26 -0.615,-31.56 -10.875,-36.948 	"/><polyline class="st36" points="-0.615,-26.26 -0.615,-31.56 1.972,-32.913 7.036,-30.253 	"/><polyline class="st36" points="28.477,-41.438 28.477,-46.74 31.065,-48.092 36.127,-45.432 	"/><polygon class="st61" points="8.543,-59.718 0.547,-63.955 -7.107,-60.009 0.892,-55.774 	"/><polygon class="st25" points="-7.107,-59.959 0.892,-55.725 0.892,-61.026 -2.061,-62.61 	"/><polyline class="st36" points="0.892,-55.725 0.892,-61.026 3.482,-62.379 8.543,-59.718 	"/><polygon class="st51" points="31.031,-39.259 -0.514,-55.52 -32.06,-39.259 -0.514,-23 	"/><polygon class="st43" points="0.961,-32.003 36.321,-13.776 36.321,-19.094 0.961,-37.319 	"/><polygon class="st20" points="0.961,-32.003 -34.401,-13.776 -34.401,-19.094 0.961,-37.319 	"/><polygon class="st112" points="36.321,-13.776 0.961,-32.003 -34.401,-13.776 0.961,4.449 	"/><polygon class="st164" points="26.995,-8.992 0.961,-22.412 -25.073,-8.992 0.961,4.427 	"/><polygon class="st180" points="0.961,-3.666 43.806,18.416 43.806,11.974 0.961,-10.109 	"/><polygon class="st19" points="0.961,-3.666 -41.885,18.416 -41.885,11.974 0.961,-10.109 	"/><polygon class="st10" points="43.806,18.416 0.961,-3.666 -41.885,18.416 0.961,40.5 	"/><polygon class="st7" points="32.506,24.213 0.961,7.953 -30.583,24.213 0.961,40.473 	"/><polygon class="st108" points="43.798,52.316 0.665,30.084 -42.47,52.316 0.665,74.551 	"/><polygon class="st38" points="0.665,30.084 43.798,52.316 43.798,45.831 0.665,23.599 	"/><polygon class="st172" points="0.665,30.084 -42.47,52.316 -42.47,45.831 0.665,23.599 	"/></symbol><symbol  id="scientist" viewBox="-91.491 -70.827 182.982 141.654">	<path class="st63" d="M-41.398,29.823c-28.339-10.293-48.995-48.928-48.995-83.58l-0.098-14.684"/><path class="st63" d="M25.57,0.218c-3.459,5.248-7.594,8.268-10.109,7.021c-0.774-0.383-1.323-1.129-1.653-2.146"/><path class="st63" d="M24.086-18.968c1.834-1.33,3.553-1.812,4.848-1.182c2.04,1.008,2.518,4.549,1.54,9.01"/><path class="st63" d="M-40.225-1.007"/><line class="st63" x1="15.229" y1="7.132" x2="56.802" y2="30.831"/><line class="st63" x1="53.887" y1="-6.638" x2="68.895" y2="-68.749"/><path class="st63" d="M12.76-9.384c-0.169-0.213-0.329-0.438-0.477-0.674c-1.479-2.363-1.807-5.807,0.188-8.207"/><path class="st63" d="M6.189-23.472c-4.52,5.459-4.326,13.844,0.46,19.506l0.3,0.316l10.724,7.588"/><path class="st63" d="M9.333-20.868c-2.341,2.814-2.831,6.562-1.876,9.896"/><path class="st63" d="M16.534-29.067c-0.202,0.465-0.293,0.979-0.237,1.521c0.071,0.725,0.362,1.377,0.854,1.828		c0.854,0.775,3.271,2.695,3.271,2.695"/><path class="st118" d="M-18.863-69.827c-1.38,0-2.451,0.939-1.228,2.836c2.127,3.271,9.295,17.436,9.98,18.332		c1.153,1.496,1.137,2.541,0.188,2.541c-0.942,0,0,0-1.894,0c-1.89,0-1.699,2.646,0,2.646c1.571,0,11.149,0,12.854,0		s1.894-2.646,0-2.646c-1.891,0-0.942,0-1.891,0c-0.943,0-0.504-1.492,0.188-2.541c0.623-0.949,7.858-15.062,9.985-18.332		c1.229-1.896,0.149-2.836-1.229-2.836C6.113-69.827-16.873-69.827-18.863-69.827z"/><line class="st139" x1="-12.328" y1="-59.239" x2="-15.884" y2="-65.989"/><line class="st139" x1="-8.091" y1="-57.562" x2="-12.529" y2="-65.989"/><line class="st139" x1="-5.521" y1="-59.046" x2="-9.178" y2="-65.989"/><line class="st139" x1="-1.387" y1="-57.562" x2="-5.824" y2="-65.989"/><line class="st139" x1="1.093" y1="-59.226" x2="-2.471" y2="-65.989"/><line class="st139" x1="3.006" y1="-61.96" x2="0.883" y2="-65.989"/><line class="st139" x1="5.101" y1="-64.353" x2="4.236" y2="-65.989"/><path class="st118" d="M-1.783-24.651c-0.05-0.783,0.548-1.463,1.333-1.52c0.46-0.021,0.881,0.162,1.164,0.484l2.084,1.812"/><path class="st139" d="M-6.076-39.999c0.965,3.719,2.645,7.166,4.938,10.195"/><path class="st139" d="M-2.915-40.819c1.271,4.92,4.604,10.619,8.26,13.936l3.601,3.041"/><path class="st63" d="M-36.874-68.439l-7.521,46.869c-18-4-20.666-46.869-20.666-46.869"/><line class="st63" x1="33.345" y1="-61.296" x2="53.031" y2="-55.565"/><line class="st63" x1="34.188" y1="-48.464" x2="36.256" y2="-56.991"/><line class="st63" x1="36.917" y1="-47.567" x2="38.984" y2="-56.097"/><polyline class="st63" points="45.396,-49.376 45.548,-50.001 46.611,-54.386 	"/><path class="st63" d="M10.838,38.884c1.264,0.057,58.369,5.922,65.25,5.922c7.953,0,14.403-6.361,14.403-14.213		c0-4.547-2.165-8.604-5.531-11.199l-55.587-39.26"/><path class="st118" d="M6.58-33.587c-0.783-0.092-1.49,0.479-1.581,1.252c-0.053,0.457,0.117,0.895,0.421,1.188l0.003-0.002		L34.181-5.198c0.695,0.66,1.131,1.592,1.131,2.627c0,1.998-1.62,3.619-3.62,3.619c-0.842,0-1.614-0.287-2.228-0.771L13.755-13.952"		/><path class="st63" d="M-18.607,32.321"/><line class="st139" x1="-17.772" y1="-23.472" x2="-10.604" y2="-36.761"/><line class="st139" x1="-14.98" y1="-39.999" x2="-20.563" y2="-33.597"/><line class="st139" x1="-17.67" y1="-43.235" x2="-27.569" y2="-38.731"/><line class="st139" x1="-18.671" y1="-47.296" x2="-25.323" y2="-47.296"/><path class="st63" d="M-33.738,59.88c0.401-5.266,8.302-9.723,17.442-8.244c4.062,0.646,6.131,2.562,11.455,2.996"/><path class="st63" d="M-30.775,63.335c2.976-2.932,8.97-5.639,15.382-4.146"/><path class="st157" d="M-22.691,29.495"/><path class="st63" d="M-7.98,38.991c2.258,0,4.088-1.83,4.088-4.088s-1.83-4.088-4.088-4.088s-4.088,1.83-4.088,4.088		S-10.238,38.991-7.98,38.991z"/><path class="st63" d="M-26.788,36.101c2.258,0,4.088-1.828,4.088-4.088c0-2.258-1.83-4.088-4.088-4.088		c-2.258,0-4.088,1.83-4.088,4.088C-30.875,34.271-29.045,36.101-26.788,36.101z"/><path class="st63" d="M-1.487,21.153c0-1.867,1.513-3.379,3.378-3.379c1.865,0,3.378,1.512,3.378,3.379"/><path class="st63" d="M-30.396,19.095c-1.865,0-3.378,1.514-3.378,3.377v6.719"/><path class="st63" d="M-2.149,16.997c-1.865,0-3.378-1.514-3.378-3.379c0-1.857,1.513-3.377,3.378-3.377"/><path class="st63" d="M-1.266,6.731c1.865,0,3.377,1.514,3.377,3.379c0,1.863-1.511,3.377-3.377,3.377"/><path class="st63" d="M-4.909,2.63c-1.866,0-3.378-1.52-3.378-3.385c0-1.857,1.512-3.377,3.378-3.377"/><path class="st63" d="M-17.738,3.636c-1.866,0-3.378-1.52-3.378-3.379c0-1.865,1.512-3.377,3.378-3.377"/><path class="st63" d="M-10.628-3.263c0-1.865-1.512-3.377-3.378-3.377"/><path class="st63" d="M-25.227,2.054c1.865,0,3.377,1.514,3.377,3.377"/><path class="st63" d="M-30.762,12.519c1.866,0,3.384,1.514,3.384,3.379c0,1.863-1.517,3.379-3.384,3.379"/><path class="st63" d="M-27.277,9.606c0-1.865,1.513-3.377,3.378-3.377"/><path class="st63" d="M-15.229,2.106c-1.865,0-3.378,1.514-3.378,3.379v3.613"/><path class="st63" d="M-15.521-1.591c1.866,0,3.378,1.52,3.378,3.377v5.734"/><path class="st63" d="M-11.471,4.343c1.866,0,3.379,1.514,3.379,3.377v5.729"/><path class="st63" d="M-2.152-0.833c-1.866,0-3.378,1.521-3.378,3.385v5.729"/><line class="st63" x1="-19.021" y1="13.126" x2="-10.269" y2="14.466"/><path class="st63" d="M-22.919,11.394l-0.415,3.59c-0.214,1.854,1.112,3.527,2.968,3.742l3.174,0.367"/><path class="st63" d="M-8.061,12.968l-0.229,3.604c-0.121,1.861-1.729,3.271-3.594,3.152l-3.188-0.209"/><path class="st63" d="M-3.839,36.101c3.637,0,9.265,3.393,9.265,13.205"/><path class="st63" d="M-22.7,32.013c0,0,4.509,5.053,10.631,2.221"/><path class="st63" d="M-30.876,32.013c-4.652,0.344-4.938,2.855-4.938,5.688c0,4.219-1.207,7.984-1.207,10.908		c0,11.719,9.502,21.219,21.226,21.219c11.72,0,21.222-9.5,21.222-21.219c0-2.336-0.032-4.906-0.157-7.578c0,0,0-16.746,0-19.875"/><path class="st63" d="M-0.688,64.024"/><path class="st157" d="M-10.594,35.382c0.063,0.873,0.821,1.521,1.693,1.461"/><path class="st157" d="M-29.687,32.448c0.068,0.873,0.827,1.525,1.699,1.459"/><path class="st63" d="M-25.596,67.575c4.396-3.875,9.232-0.688,14.729-4.004"/></symbol>';
var pxSvgIconString = pxSvgIconString || ''; pxSvgIconString+='<g id="engine-sniff">			<use xlink:href="#YellowCode"  width="241.716" height="129.168" x="-120.858" y="-64.584" transform="matrix(0.9087 0 0 -0.9087 113.8237 91.5098)" style="overflow:visible;"/><circle class="st179" cx="305.208" cy="22.907" r="18.907"/><polygon class="st73" points="305.548,9.354 317.696,16.315 317.696,30.238 305.548,37.201 293.398,30.238 293.398,16.315 	"/><path class="st179" d="M313.334,18.931c0-0.312-0.162-0.593-0.427-0.744l-7.099-4.25c-0.112-0.07-0.254-0.283-0.39-0.283		c-0.013,0-0.062,0-0.073,0c-0.136,0-0.269,0.213-0.392,0.283l-7.089,4.166c-0.271,0.151-0.434,0.478-0.434,0.787l0.02,11.007		c0,0.151,0.079,0.305,0.214,0.38c0.132,0.078,0.294,0.084,0.426,0.006l4.245-2.409c0.271-0.148,0.462-0.437,0.462-0.732v-5.142		c0-0.306,0.13-0.59,0.396-0.731l1.771-1.034c0.139-0.077,0.271-0.114,0.421-0.114c0.146,0,0.292,0.037,0.427,0.114l1.92,1.034		c0.267,0.146,0.555,0.436,0.555,0.731v5.142c0,0.306,0.037,0.586,0.301,0.733l4.149,2.413c0.133,0.079,0.267,0.079,0.396,0		c0.13-0.068,0.195-0.217,0.195-0.359L313.334,18.931L313.334,18.931z"/><circle class="st73" cx="305.004" cy="71.405" r="18.907"/><polygon class="st98" points="305.58,62.675 299.275,62.675 299.275,60.037 302.082,57.07 309.641,57.07 312.586,60.145 		312.586,67.594 309.826,70.382 301.041,70.382 297.873,73.578 297.873,77.599 295.038,77.236 292.267,74.588 292.267,67.29 		295.479,64.076 305.58,64.076 	"/><rect x="302.518" y="59.064" transform="matrix(-0.7077 0.7065 -0.7065 -0.7077 560.3641 -112.0331)" class="st73" width="1.681" height="1.679"/><polygon class="st3" points="306.281,79.49 312.586,79.49 312.586,81.925 309.909,84.395 302.348,84.395 299.275,81.817 		299.275,74.367 302.164,71.783 310.951,71.783 313.987,68.716 313.987,64.629 316.99,64.725 319.592,67.373 319.592,74.67 		316.51,78.089 306.281,78.089 	"/><rect x="308.171" y="81.104" transform="matrix(0.7074 -0.7068 0.7068 0.7074 32.4977 242.3899)" class="st73" width="1.677" height="1.679"/><circle class="st181" cx="304.834" cy="117.692" r="18.907"/><g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<defs>														<circle id="SVGID_10_" cx="304.834" cy="117.692" r="18.907"/></defs>													<clipPath id="SVGID_11_">														<use xlink:href="#SVGID_10_"  style="overflow:visible;"/></clipPath>													<path class="st183" d="M309.725,120.991l5.976,13.658c0,0,10.776-3.912,10.776-13.556														c0-4.519-2.613-11.021-2.613-11.021l-10.428-0.392"/></g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<defs>														<circle id="SVGID_12_" cx="304.834" cy="117.692" r="18.907"/></defs>													<clipPath id="SVGID_13_">														<use xlink:href="#SVGID_12_"  style="overflow:visible;"/></clipPath>													<path class="st27" d="M310.577,122.358l-6.127,15.372c0,0,8.59,0.259,11.315-1.925														c2.271-1.813,0.107-9.604,0.107-9.604L310.577,122.358z"/></g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<defs>														<circle id="SVGID_14_" cx="304.834" cy="117.692" r="18.907"/></defs>													<clipPath id="SVGID_15_">														<use xlink:href="#SVGID_14_"  style="overflow:visible;"/></clipPath>													<polygon class="st29" points="315.135,111.443 319.081,117.188 312.833,127.928 310.577,122.895 													"/></g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<defs>														<circle id="SVGID_16_" cx="304.834" cy="117.692" r="18.907"/></defs>													<clipPath id="SVGID_17_">														<use xlink:href="#SVGID_16_"  style="overflow:visible;"/></clipPath>													<polygon class="st75" points="302.221,110.382 305.598,107.415 308.895,107.909 313.096,107.415 318.014,117.129 														312.979,124.151 307.812,121.771 308.564,117.218 307.814,120.961 305.962,120.839 304.462,122.433 303.411,122.26 														303.311,121.12 302.221,121.667 300.987,126.792 296.29,127.928 293.489,124.17 295.131,123.401 297.526,125.456 														299.338,124.17 298.35,117.667 													"/></g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<defs>														<circle id="SVGID_18_" cx="304.834" cy="117.692" r="18.907"/></defs>													<clipPath id="SVGID_19_">														<use xlink:href="#SVGID_18_"  style="overflow:visible;"/></clipPath>													<polygon class="st123" points="303.616,117.364 304.364,118.701 301.919,119.257 296.45,115.056 297.258,114.644 														301.907,117.67 													"/></g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<defs>														<circle id="SVGID_20_" cx="304.834" cy="117.692" r="18.907"/></defs>													<clipPath id="SVGID_21_">														<use xlink:href="#SVGID_20_"  style="overflow:visible;"/></clipPath>													<polygon class="st1" points="297.669,118.329 296.02,118.329 293.301,116.068 292.725,116.504 295.607,119.265 														297.999,119.527 													"/></g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<defs>														<circle id="SVGID_22_" cx="304.834" cy="117.692" r="18.907"/></defs>													<clipPath id="SVGID_23_">														<use xlink:href="#SVGID_22_"  style="overflow:visible;"/></clipPath>													<circle class="st144" cx="305.579" cy="113.753" r="1.068"/></g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<defs>														<circle id="SVGID_24_" cx="304.834" cy="117.692" r="18.907"/></defs>													<clipPath id="SVGID_25_">														<use xlink:href="#SVGID_24_"  style="overflow:visible;"/></clipPath>													<polygon class="st15" points="309.725,112.196 307.942,120.991 306.29,120.886 													"/></g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<text transform="matrix(1 0 0 1 338.4697 25.8086)" class="st160 st170 st150">node.js</text>	<text class="st48 st160 st170 st150"  transform="matrix(1 0 0 1 338.4697 74.8086)" class="st48">python</text>	<text transform="matrix(1 0 0 1 338.4697 122.8008)" class="st160 st170 st150">php</text>	<text class="st48 st66 st170 st150"  transform="matrix(1 0 0 1 338.4697 170.7988)" class="st48">ruby</text>	<text transform="matrix(1 0 0 1 416.4702 26.8086)" class="st160 st170 st150">false</text>	<text transform="matrix(1 0 0 1 416.4702 75.8086)" class="st160 st170 st150">false</text>	<text transform="matrix(1 0 0 1 416.4702 123.8018)" class="st160 st170 st150">false</text>	<text transform="matrix(1 0 0 1 420.4556 169.7988)" class="st66 st116 st152">true</text>	<g>		<path class="st66" d="M399.781,171.243c-0.271,0-0.521-0.052-0.732-0.155c-0.22-0.104-0.43-0.235-0.627-0.42l-3.695-3.713			c-0.188-0.186-0.319-0.396-0.42-0.637c-0.092-0.238-0.139-0.479-0.139-0.724s0.047-0.481,0.139-0.725			c0.094-0.229,0.232-0.436,0.42-0.604c0.188-0.188,0.396-0.329,0.645-0.429c0.229-0.104,0.479-0.147,0.725-0.147			s0.482,0.05,0.715,0.147c0.233,0.099,0.441,0.232,0.627,0.429l2.354,2.354l5.938-5.963c0.188-0.186,0.396-0.325,0.628-0.418			c0.232-0.093,0.479-0.14,0.729-0.14s0.49,0.047,0.723,0.14c0.233,0.093,0.441,0.232,0.627,0.418			c0.188,0.188,0.324,0.396,0.41,0.628c0.088,0.232,0.131,0.479,0.131,0.729s-0.043,0.481-0.131,0.724			c-0.086,0.232-0.223,0.441-0.41,0.627l-7.305,7.312c-0.174,0.177-0.375,0.312-0.604,0.42			C400.296,171.193,400.049,171.243,399.781,171.243z"/></g>	<line class="st77" x1="394.244" y1="21.902" x2="405.244" y2="21.902"/><line class="st77" x1="394.244" y1="68.9" x2="405.244" y2="68.9"/><line class="st77" x1="394.244" y1="117.892" x2="405.244" y2="117.892"/><g>		<g>			<polyline class="st77" points="279.3,23.33 204.663,23.33 174.722,53.271 			"/><g>				<circle class="st160" cx="174.802" cy="53.19" r="2.256"/></g>		</g>	</g>	<g>		<g>			<polyline class="st77" points="279.3,64.629 230.037,64.629 219.595,75.07 			"/><g>				<circle class="st160" cx="219.675" cy="74.99" r="2.256"/></g>		</g>	</g>	<g>		<g>			<polyline class="st138" points="279.3,164.736 203.221,164.736 174.722,136.237 			"/><g>				<circle class="st134" cx="174.802" cy="136.316" r="2.256"/></g>		</g>	</g>	<g>		<g>			<polyline class="st77" points="279.3,124.879 230.037,124.879 219.595,114.438 			"/><g>				<circle class="st160" cx="219.675" cy="114.518" r="2.256"/></g>		</g>	</g>	<path class="st77" d="M279.3,173.354"/><use xlink:href="#Ruby"  width="64.608" height="64.607" x="-32.304" y="-32.304" transform="matrix(0.5889 0 0 -0.5889 305.5469 167.3496)" style="overflow:visible;"/></g><g id="proxy-router">	<polygon class="st94" points="307.459,107.878 157.52,185.269 4,106.49 153.945,29.098 	"/><polygon class="st61" points="178.645,125.289 125.74,153.125 99.271,139.457 152.191,111.639 	"/><polygon class="st25" points="99.271,139.291 152.191,111.466 152.191,129.824 116.719,148.47 	"/><polyline class="st36" points="152.191,111.466 152.191,129.824 161.135,134.499 178.645,125.289 	"/><polygon class="st61" points="145.07,107.867 92.16,135.701 65.693,122.041 118.617,94.216 	"/><polygon class="st25" points="65.693,121.862 118.617,94.038 118.617,112.397 83.15,131.044 	"/><polyline class="st36" points="118.617,94.038 118.617,112.397 127.562,117.072 145.07,107.867 	"/><polygon class="st61" points="111.496,90.268 58.588,118.099 32.121,104.437 85.041,76.615 	"/><polygon class="st25" points="32.121,104.263 85.041,76.437 85.041,94.796 49.57,113.447 	"/><polyline class="st36" points="85.041,76.437 85.041,94.796 93.984,99.472 111.496,90.268 	"/><polygon class="st36" points="157.52,185.472 307.459,108.083 307.459,146.455 157.52,223.843 	"/><polygon class="st25" points="157.52,185.472 4,106.49 4,144.861 157.52,223.843 	"/><polygon class="st61" points="280.777,106.834 253.129,121.503 226.664,107.839 254.324,93.181 	"/><polygon class="st25" points="226.664,107.667 254.324,93.005 254.324,111.365 244.111,116.849 	"/><polyline class="st36" points="254.324,93.005 254.324,111.365 263.271,116.045 280.777,106.834 	"/><polygon class="st61" points="247.205,89.233 194.297,117.072 167.832,103.406 220.75,75.581 	"/><polygon class="st25" points="167.832,103.23 220.75,75.415 220.75,93.763 185.279,112.409 	"/><polyline class="st36" points="220.75,75.415 220.75,93.763 229.699,98.443 247.205,89.233 	"/><polygon class="st61" points="213.625,71.809 160.721,99.642 134.256,85.976 187.174,58.159 	"/><polygon class="st25" points="134.256,85.804 187.174,57.982 187.174,76.341 151.707,94.982 	"/><polyline class="st36" points="187.174,57.982 187.174,76.341 196.123,81.019 213.625,71.809 	"/><polygon class="st61" points="180.057,54.208 127.146,82.042 100.678,68.377 153.602,40.557 	"/><polygon class="st25" points="100.678,68.205 153.602,40.385 153.602,58.737 118.135,77.383 	"/><polyline class="st36" points="153.602,40.385 153.602,58.737 162.551,63.419 180.057,54.208 	"/><g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_26_" points="280.777,106.834 253.129,121.503 226.664,107.839 254.324,93.181 																																																					"/></defs>																									<clipPath id="SVGID_27_">																										<use xlink:href="#SVGID_26_"  style="overflow:visible;"/></clipPath>																									<polygon class="st71" points="275.883,107.604 254.332,118.73 232.77,107.604 254.336,96.478 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_28_" points="280.777,106.834 253.129,121.503 226.664,107.839 254.324,93.181 																																																					"/></defs>																									<clipPath id="SVGID_29_">																										<use xlink:href="#SVGID_28_"  style="overflow:visible;"/></clipPath>																									<polygon class="st82" points="275.883,124.675 275.883,107.604 254.332,118.73 254.332,135.261 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_30_" points="280.777,106.834 253.129,121.503 226.664,107.839 254.324,93.181 																																																					"/></defs>																									<clipPath id="SVGID_31_">																										<use xlink:href="#SVGID_30_"  style="overflow:visible;"/></clipPath>																									<polygon class="st177" points="254.332,118.73 232.77,107.604 232.77,124.227 254.332,135.261 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_32_" points="111.496,90.268 58.588,118.099 32.121,104.437 85.041,76.615 																																																					"/></defs>																									<clipPath id="SVGID_33_">																										<use xlink:href="#SVGID_32_"  style="overflow:visible;"/></clipPath>																									<polygon class="st78" points="104.391,90.102 58.285,114.279 38.75,104.162 84.867,79.995 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_34_" points="111.496,90.268 58.588,118.099 32.121,104.437 85.041,76.615 																																																					"/></defs>																									<clipPath id="SVGID_35_">																										<use xlink:href="#SVGID_34_"  style="overflow:visible;"/></clipPath>																									<polygon class="st23" points="104.391,107.169 104.391,90.103 58.285,114.279 58.283,130.806 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_36_" points="111.496,90.268 58.588,118.099 32.121,104.437 85.041,76.615 																																																					"/></defs>																									<clipPath id="SVGID_37_">																										<use xlink:href="#SVGID_36_"  style="overflow:visible;"/></clipPath>																									<polygon class="st126" points="58.285,114.279 38.75,104.162 38.75,120.781 58.283,130.806 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_38_" points="145.068,107.871 92.16,135.703 65.693,122.041 118.613,94.218 																																																					"/></defs>																									<clipPath id="SVGID_39_">																										<use xlink:href="#SVGID_38_"  style="overflow:visible;"/></clipPath>																									<polygon class="st176" points="137.963,107.705 91.857,131.882 72.322,121.765 118.439,97.597 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_40_" points="145.068,107.871 92.16,135.703 65.693,122.041 118.613,94.218 																																																					"/></defs>																									<clipPath id="SVGID_41_">																										<use xlink:href="#SVGID_40_"  style="overflow:visible;"/></clipPath>																									<polygon class="st70" points="137.963,124.773 137.963,107.706 91.857,131.882 91.855,148.409 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_42_" points="145.068,107.871 92.16,135.703 65.693,122.041 118.613,94.218 																																																					"/></defs>																									<clipPath id="SVGID_43_">																										<use xlink:href="#SVGID_42_"  style="overflow:visible;"/></clipPath>																									<polygon class="st28" points="91.857,131.882 72.322,121.765 72.322,138.384 91.855,148.409 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_44_" points="178.641,125.473 125.732,153.305 99.266,139.643 152.188,111.822 																																																					"/></defs>																									<clipPath id="SVGID_45_">																										<use xlink:href="#SVGID_44_"  style="overflow:visible;"/></clipPath>																									<polygon class="st14" points="171.535,125.308 125.432,149.485 105.895,139.368 152.012,115.201 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_46_" points="178.641,125.473 125.732,153.305 99.266,139.643 152.188,111.822 																																																					"/></defs>																									<clipPath id="SVGID_47_">																										<use xlink:href="#SVGID_46_"  style="overflow:visible;"/></clipPath>																									<polygon class="st165" points="171.535,142.376 171.535,125.309 125.432,149.485 125.43,166.011 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_48_" points="178.641,125.473 125.732,153.305 99.266,139.643 152.188,111.822 																																																					"/></defs>																									<clipPath id="SVGID_49_">																										<use xlink:href="#SVGID_48_"  style="overflow:visible;"/></clipPath>																									<polygon class="st129" points="125.432,149.485 105.895,139.368 105.895,155.987 125.43,166.011 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<g>		<g>			<path class="st143" d="M254.324,101.947v-8.938C254.324,43.851,214.525,4,165.428,4c-39.514-0.001-73.004,25.812-84.562,61.521"				/><g>				<path class="st105" d="M79.656,69.568c-0.104-2.115-0.562-4.85-1.367-6.709l2.812,2.153l3.525-0.143					C82.904,65.924,80.959,67.895,79.656,69.568z"/></g>		</g>	</g>	<g>		<g>			<path class="st162" d="M84.301,94.017c0-7.39,0.986-14.55,2.836-21.352c9.359-34.425,40.811-59.738,78.146-59.736				c43.311,0,78.68,34.044,80.875,76.863"/><g>				<path class="st173" d="M246.264,94.017c-0.797-1.965-2.129-4.393-3.508-5.881l3.363,1.104l3.291-1.306					C248.125,89.505,246.939,92.008,246.264,94.017z"/></g>		</g>	</g>	<g>		<g>			<line class="st162" x1="267.861" y1="103.462" x2="421.248" y2="24.193"/><g>				<path class="st173" d="M425,22.253c-1.428,1.565-3.041,3.815-3.787,5.704l-0.457-3.513l-2.6-2.401					C420.127,22.526,422.896,22.511,425,22.253z"/></g>		</g>	</g>			<linearGradient id="SVGID_50_" gradientUnits="userSpaceOnUse" x1="-1604.3159" y1="9981.875" x2="-1441.4443" y2="10067.3203" gradientTransform="matrix(1 0 0 -1 1856 10084.5)">		<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>	<polygon class="st161" points="250.207,103.425 249.748,102.534 414.557,17.148 415.018,18.04 	"/><polygon class="st61" points="233.758,131.619 206.453,146.105 180.32,132.612 207.635,118.136 	"/><polygon class="st25" points="180.32,132.442 207.635,117.962 207.635,136.09 197.551,141.508 	"/><g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_51_" points="234.146,131.436 206.498,146.105 180.033,132.442 207.693,117.784 																																																					"/></defs>																									<clipPath id="SVGID_52_">																										<use xlink:href="#SVGID_51_"  style="overflow:visible;"/></clipPath>																									<polygon class="st58" points="229.252,132.207 207.701,143.334 186.139,132.207 207.705,121.08 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_53_" points="234.146,131.436 206.498,146.105 180.033,132.442 207.693,117.784 																																																					"/></defs>																									<clipPath id="SVGID_54_">																										<use xlink:href="#SVGID_53_"  style="overflow:visible;"/></clipPath>																									<polygon class="st115" points="229.252,149.278 229.252,132.207 207.701,143.334 207.701,159.865 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_55_" points="234.146,131.436 206.498,146.105 180.033,132.442 207.693,117.784 																																																					"/></defs>																									<clipPath id="SVGID_56_">																										<use xlink:href="#SVGID_55_"  style="overflow:visible;"/></clipPath>																									<polygon class="st175" points="207.701,143.334 186.139,132.207 186.139,148.83 207.701,159.865 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<polygon class="st61" points="185.271,156.214 157.625,170.884 131.158,157.222 158.818,142.565 	"/><polygon class="st25" points="131.158,157.049 158.818,142.388 158.818,160.746 148.605,166.23 	"/><polyline class="st36" points="158.818,142.388 158.818,160.746 168.664,165.877 186.17,156.665 	"/><linearGradient id="SVGID_57_" gradientUnits="userSpaceOnUse" x1="-1590.9565" y1="10028.6191" x2="-1590.9565" y2="9965.9424" gradientTransform="matrix(1 0 0 -1 1856 10084.5)">		<stop  offset="0" style="stop-color:#FFFFFF;stop-opacity:0"/><stop  offset="1" style="stop-color:#FFFFFF"/></linearGradient>	<polygon class="st32" points="275.756,107.781 275.756,20.056 254.33,31.123 254.33,118.306 	"/><linearGradient id="SVGID_58_" gradientUnits="userSpaceOnUse" x1="-1612.3882" y1="10028.6191" x2="-1612.3882" y2="9965.9424" gradientTransform="matrix(1 0 0 -1 1856 10084.5)">		<stop  offset="0" style="stop-color:#FFFFFF;stop-opacity:0"/><stop  offset="1" style="stop-color:#8C8C8C"/></linearGradient>	<polygon class="st142" points="254.33,31.123 232.893,20.056 232.893,107.333 254.33,118.306 	"/></g><g id="boxfile">	<rect x="262.228" y="4" class="st25" width="132.914" height="185"/><rect x="278.769" y="24.863" class="st101" width="32.938" height="5.604"/><rect x="288.659" y="37.554" class="st101" width="41.492" height="5.604"/><rect x="288.659" y="50.244" class="st101" width="41.492" height="5.603"/><rect x="336.983" y="37.554" class="st101" width="21.717" height="5.604"/><rect x="336.983" y="50.244" class="st101" width="9.854" height="5.603"/><rect x="288.659" y="99.095" class="st117" width="41.492" height="5.604"/><rect x="288.659" y="111.783" class="st117" width="41.492" height="5.604"/><rect x="336.983" y="99.095" class="st117" width="21.717" height="5.604"/><rect x="288.659" y="64.037" class="st101" width="41.492" height="5.604"/><rect x="336.983" y="64.037" class="st101" width="21.717" height="5.604"/><rect x="336.983" y="111.783" class="st117" width="9.854" height="5.604"/><rect x="278.769" y="86.404" class="st117" width="32.938" height="5.604"/><rect x="288.659" y="145.598" class="st92" width="41.492" height="5.604"/><rect x="288.659" y="158.287" class="st92" width="41.492" height="5.604"/><rect x="336.983" y="145.598" class="st92" width="21.717" height="5.604"/><rect x="336.983" y="158.287" class="st92" width="9.854" height="5.604"/><rect x="278.769" y="132.908" class="st92" width="32.938" height="5.604"/><g>		<g>			<line class="st110" x1="169.48" y1="63.409" x2="261.657" y2="63.409"/><g>				<circle class="st101" cx="261.471" cy="63.409" r="3.76"/></g>		</g>	</g>			<use xlink:href="#Memcached"  width="66" height="66" x="-33" y="-33" transform="matrix(0.5018 0 0 -0.5018 389.9336 143.8848)" style="overflow:visible;"/><use xlink:href="#Mongo"  width="65" height="65" x="-32.5" y="-32.5" transform="matrix(0.5018 0 0 -0.5018 389.6826 89.6045)" style="overflow:visible;"/><use xlink:href="#Ruby"  width="64.608" height="64.607" x="-32.304" y="-32.304" transform="matrix(0.5018 0 0 -0.5018 389.584 35.3242)" style="overflow:visible;"/><text class="st48 st101 st170 st135"  transform="matrix(1 0 0 1 124.1235 68.249)" class="st48">rails</text>	<text transform="matrix(1 0 0 1 112.1265 68.249)" class="st66 st170 st135">/</text>	<text class="st48 st101 st170 st135"  transform="matrix(1 0 0 1 68.022 68.248)" class="st48">ruby</text>			<use xlink:href="#Ruby"  width="64.608" height="64.607" x="-32.304" y="-32.304" transform="matrix(0.7171 0 0 -0.7171 27.165 63.04)" style="overflow:visible;"/></g><g id="code-built_1_">			<use xlink:href="#New_Symbol"  width="274" height="110.564" id="code-built" x="-137" y="-55.282" transform="matrix(1 0 0 -1 141 59.2822)" style="overflow:visible;"/></g><g id="watched-files">			<use xlink:href="#YellowCode"  width="241.716" height="129.168" x="-120.858" y="-64.584" transform="matrix(0.8169 0 0 -0.8169 360.623 106.9609)" style="overflow:visible;"/><polygon class="st30" points="449.643,100.123 360.877,146.01 272.107,100.123 360.877,54.239 	"/><use xlink:href="#YellowCode"  width="241.716" height="129.168" x="-120.858" y="-64.584" transform="matrix(0.8169 0 0 -0.8169 360.623 81.3779)" style="overflow:visible;"/><polygon class="st30" points="449.643,74.543 360.877,120.427 272.107,74.543 360.877,28.656 	"/><use xlink:href="#YellowCode"  width="241.716" height="129.168" x="-120.858" y="-64.584" transform="matrix(0.8169 0 0 -0.8169 360.623 56.7588)" style="overflow:visible;"/><polygon class="st156" points="305.896,46.793 286.387,56.867 282.906,55.03 302.422,44.957 	"/><polygon class="st156" points="388.641,74.392 361.182,88.586 357.703,86.748 385.162,72.556 	"/><polygon class="st156" points="411.342,41.022 383.883,55.217 380.404,53.38 407.863,39.185 	"/><g>		<g>			<polyline class="st47" points="263.256,57.318 247.186,73.435 197.129,73.435 			"/><g>				<path class="st108" d="M192.902,73.435c1.988-0.737,4.455-1.996,5.982-3.329l-1.203,3.329l1.203,3.323					C197.357,75.429,194.891,74.171,192.902,73.435z"/></g>		</g>	</g>	<g>		<g>			<polyline class="st47" points="263.256,105.664 247.186,89.548 197.129,89.548 			"/><g>				<path class="st108" d="M192.902,89.548c1.988-0.732,4.455-1.996,5.982-3.329l-1.203,3.329l1.203,3.328					C197.357,91.543,194.891,90.285,192.902,89.548z"/></g>		</g>	</g>	<g>		<g>			<line class="st47" x1="257.729" y1="81.49" x2="197.129" y2="81.49"/><g>				<path class="st108" d="M192.902,81.49c1.988-0.729,4.455-1.996,5.982-3.328l-1.203,3.328l1.203,3.328					C197.357,83.485,194.891,82.228,192.902,81.49z"/></g>		</g>	</g>			<use xlink:href="#New_Symbol"  width="274" height="110.564" id="XMLID_1_" x="-137" y="-55.282" transform="matrix(0.632 0 0 -0.632 90.584 89.4639)" style="overflow:visible;"/><text transform="matrix(1 0 0 1 62.3555 28.1631)" class="st107 st116 st151">$</text>	<text transform="matrix(1 0 0 1 71.957 28.1631)" class="st148 st116 st151"> </text>	<text transform="matrix(1 0 0 1 81.5586 28.1631)" class="st156 st116 st151">nanobox up --watch</text></g><g id="terminal">	<rect x="4" y="28.761" class="st34" width="949" height="333.005"/><rect x="4" y="4" class="st69" width="949" height="25"/><ellipse class="st34" cx="18.39" cy="16.971" rx="5.968" ry="5.968"/><ellipse class="st34" cx="36.624" cy="16.971" rx="5.968" ry="5.968"/><ellipse class="st34" cx="54.858" cy="16.971" rx="5.968" ry="5.968"/></g><g id="logo">	<path class="st182" d="M5.632,65.563l8.924,13.027h0.043V65.563h1.459v15.4h-1.631L5.503,67.936H5.46v13.028H4v-15.4H5.632		L5.632,65.563z"/><path class="st182" d="M29.101,65.563l6.021,15.4h-1.566l-1.864-4.789h-6.974l-1.846,4.789h-1.545l6.146-15.4H29.101L29.101,65.563		z M31.181,74.925l-2.959-7.896l-3.062,7.896H31.181z"/><path class="st182" d="M41.974,65.563l8.938,13.027h0.043V65.563h1.459v15.4h-1.646l-8.925-13.028H41.8v13.028h-1.461v-15.4H41.974		L41.974,65.563z"/><path class="st182" d="M58.963,70.222c0.299-0.963,0.75-1.814,1.354-2.555c0.604-0.741,1.354-1.33,2.264-1.771		c0.91-0.438,1.965-0.659,3.164-0.659c1.203,0,2.254,0.229,3.156,0.659c0.896,0.438,1.646,1.027,2.25,1.771		c0.604,0.729,1.053,1.592,1.354,2.555c0.301,0.964,0.449,1.979,0.449,3.042c0,1.064-0.148,2.078-0.449,3.041		c-0.301,0.964-0.75,1.812-1.354,2.546c-0.604,0.733-1.354,1.319-2.25,1.758c-0.902,0.438-1.953,0.657-3.156,0.657		c-1.199,0-2.254-0.219-3.164-0.657c-0.906-0.438-1.66-1.021-2.264-1.758c-0.604-0.734-1.062-1.582-1.354-2.546		c-0.301-0.963-0.451-1.977-0.451-3.041C58.512,72.2,58.664,71.186,58.963,70.222z M60.303,75.733		c0.229,0.812,0.566,1.539,1.031,2.188c0.463,0.64,1.062,1.146,1.789,1.542c0.729,0.388,1.604,0.582,2.617,0.582		c1.018,0,1.885-0.194,2.604-0.582c0.729-0.396,1.316-0.902,1.781-1.542c0.465-0.646,0.807-1.366,1.029-2.188		c0.221-0.812,0.332-1.636,0.332-2.47c0-0.849-0.111-1.675-0.332-2.479c-0.23-0.812-0.564-1.528-1.029-2.188		c-0.465-0.64-1.059-1.146-1.781-1.541c-0.721-0.39-1.59-0.58-2.604-0.58c-1.021,0-1.896,0.19-2.617,0.58		c-0.73,0.396-1.326,0.901-1.789,1.541c-0.465,0.646-0.809,1.363-1.031,2.188c-0.221,0.806-0.332,1.632-0.332,2.479		C59.971,74.098,60.082,74.922,60.303,75.733z"/><path class="st182" d="M85.566,65.563c0.645,0,1.262,0.062,1.854,0.188c0.592,0.104,1.115,0.312,1.566,0.625		c0.451,0.295,0.811,0.684,1.084,1.146c0.27,0.482,0.404,1.082,0.404,1.812c0,0.396-0.062,0.795-0.191,1.176		c-0.127,0.382-0.312,0.729-0.547,1.036c-0.235,0.307-0.521,0.566-0.836,0.786c-0.32,0.216-0.688,0.364-1.084,0.452v0.045		c0.979,0.128,1.771,0.527,2.354,1.218c0.586,0.683,0.881,1.526,0.881,2.535c0,0.243-0.021,0.521-0.062,0.83		c-0.043,0.309-0.129,0.625-0.261,0.938c-0.137,0.323-0.312,0.646-0.562,0.976c-0.242,0.312-0.562,0.597-0.975,0.814		c-0.406,0.237-0.91,0.438-1.502,0.582c-0.604,0.151-1.312,0.229-2.145,0.229h-6.479V65.552L85.566,65.563L85.566,65.563z		 M85.566,72.314c0.588,0,1.094-0.062,1.521-0.205c0.428-0.137,0.785-0.322,1.072-0.56c0.285-0.238,0.502-0.521,0.645-0.832		c0.146-0.315,0.227-0.653,0.227-1.013c0-1.938-1.152-2.896-3.455-2.896h-5.021v5.5L85.566,72.314L85.566,72.314z M85.566,79.713		c0.545,0,1.059-0.047,1.545-0.146c0.479-0.093,0.914-0.262,1.285-0.507c0.375-0.244,0.668-0.568,0.881-0.979		c0.215-0.409,0.322-0.938,0.322-1.541c0-0.993-0.354-1.737-1.041-2.232c-0.693-0.496-1.691-0.745-2.992-0.745h-5.021v6.147		L85.566,79.713L85.566,79.713z"/><path class="st182" d="M96.891,70.222c0.312-0.963,0.752-1.814,1.355-2.555c0.6-0.741,1.354-1.33,2.264-1.771		c0.906-0.438,1.961-0.659,3.164-0.659c1.199,0,2.252,0.229,3.152,0.659c0.895,0.438,1.645,1.027,2.254,1.771		c0.6,0.729,1.051,1.592,1.35,2.555c0.301,0.964,0.451,1.979,0.451,3.042c0,1.064-0.15,2.078-0.451,3.041		c-0.299,0.964-0.75,1.812-1.35,2.546c-0.605,0.733-1.355,1.319-2.254,1.758c-0.9,0.439-1.953,0.657-3.152,0.657		c-1.203,0-2.258-0.219-3.164-0.657c-0.91-0.438-1.664-1.021-2.264-1.758c-0.605-0.734-1.051-1.582-1.355-2.546		c-0.301-0.963-0.438-1.977-0.438-3.041C96.443,72.2,96.59,71.186,96.891,70.222z M98.234,75.733		c0.221,0.812,0.562,1.539,1.021,2.188c0.465,0.64,1.062,1.146,1.793,1.542c0.729,0.388,1.604,0.582,2.617,0.582		c1.012,0,1.885-0.194,2.604-0.582c0.729-0.396,1.312-0.902,1.771-1.542c0.467-0.646,0.812-1.366,1.031-2.188		c0.223-0.812,0.332-1.636,0.332-2.47c0-0.849-0.109-1.675-0.332-2.479c-0.229-0.812-0.564-1.528-1.031-2.188		c-0.465-0.64-1.062-1.146-1.771-1.541c-0.729-0.39-1.604-0.58-2.604-0.58c-1.021,0-1.892,0.19-2.617,0.58		c-0.729,0.396-1.328,0.901-1.793,1.541c-0.465,0.646-0.809,1.363-1.021,2.188c-0.229,0.806-0.332,1.632-0.332,2.479		C97.902,74.098,98.012,74.922,98.234,75.733z"/><path class="st182" d="M117.252,65.563l4.332,6.45l4.484-6.45h1.629l-5.232,7.506l5.533,7.896h-1.758l-4.656-6.794l-4.719,6.794		h-1.631l5.479-7.938l-5.188-7.463L117.252,65.563L117.252,65.563z"/><polygon class="st158" points="63.803,44.473 82.779,34.639 82.779,37.506 63.803,47.341 	"/><polygon class="st94" points="63.803,44.473 44.828,34.639 44.828,37.506 63.803,47.341 	"/><polygon class="st158" points="63.803,37.626 82.779,27.793 82.779,30.66 63.803,40.494 	"/><polygon class="st94" points="63.803,37.626 44.828,27.793 44.828,30.66 63.803,40.494 	"/><polygon class="st158" points="63.803,30.78 82.779,20.947 82.779,23.813 63.803,33.648 	"/><polygon class="st94" points="63.803,30.78 44.828,20.947 44.828,23.813 63.803,33.648 	"/><polygon class="st53" points="82.779,14.101 63.803,23.934 44.379,13.835 63.354,4 	"/><polygon class="st158" points="63.803,23.934 82.779,14.101 82.779,16.968 63.803,26.803 	"/><polygon class="st94" points="63.803,23.94 44.32,13.731 44.32,16.684 63.803,26.895 	"/></g><g id="docker-containers">	<polygon class="st94" points="307.029,127.55 157.314,204.717 4.029,126.16 153.746,48.997 	"/><polygon class="st61" points="178.406,144.912 125.582,172.667 99.158,159.038 151.992,131.302 	"/><polygon class="st25" points="99.158,158.87 151.992,131.126 151.992,149.433 116.576,168.024 	"/><polyline class="st36" points="151.992,131.126 151.992,149.433 160.928,154.095 178.406,144.912 	"/><polygon class="st61" points="144.885,127.54 92.055,155.292 65.629,141.671 118.475,113.926 	"/><polygon class="st25" points="65.629,141.493 118.475,113.75 118.475,132.055 83.061,150.647 	"/><polyline class="st36" points="118.475,113.75 118.475,132.055 127.404,136.717 144.885,127.54 	"/><polygon class="st61" points="111.361,109.987 58.531,137.741 32.111,124.118 84.945,96.374 	"/><polygon class="st25" points="32.111,123.946 84.945,96.198 84.945,114.507 49.531,133.102 	"/><polyline class="st36" points="84.945,96.198 84.945,114.507 93.877,119.168 111.361,109.987 	"/><polygon class="st36" points="157.014,204.271 306.729,127.104 306.729,165.365 157.014,242.53 	"/><polygon class="st25" points="157.285,204.555 4,125.797 4,164.063 157.285,242.815 	"/><polygon class="st61" points="280.385,126.506 252.777,141.132 226.355,127.512 253.973,112.897 	"/><polygon class="st25" points="226.355,127.338 253.973,112.719 253.973,131.024 243.775,136.494 	"/><polyline class="st36" points="253.973,112.719 253.973,131.024 262.908,135.69 280.385,126.506 	"/><polygon class="st61" points="247.486,109.142 194.662,136.892 168.238,123.267 221.078,95.529 	"/><polyline class="st36" points="221.078,95.355 221.078,113.662 230.014,118.325 247.486,109.142 	"/><polygon class="st25" points="168.238,123.092 221.078,95.355 221.078,113.651 185.656,132.241 	"/><polygon class="st61" points="213.332,91.587 160.51,119.335 134.084,105.71 186.926,77.971 	"/><polygon class="st25" points="134.084,105.54 186.926,77.799 186.926,96.105 151.514,114.69 	"/><polyline class="st36" points="186.926,77.799 186.926,96.105 195.861,100.769 213.332,91.587 	"/><polygon class="st61" points="179.816,74.034 126.988,101.786 100.562,88.163 153.404,60.423 	"/><polygon class="st25" points="100.896,88.051 153.523,60.423 153.523,78.648 118.25,97.165 	"/><polyline class="st36" points="153.523,60.423 153.523,78.648 162.414,83.299 179.826,74.151 	"/><polygon class="st61" points="185.025,175.749 157.414,190.375 130.994,176.749 158.613,162.135 	"/><polygon class="st25" points="130.994,176.578 158.613,161.96 158.613,180.262 148.414,185.733 	"/><polyline class="st36" points="158.613,161.96 158.613,180.262 167.545,184.931 185.025,175.749 	"/><polygon class="st61" points="233.904,150.252 206.295,164.879 179.873,151.255 207.49,136.64 	"/><polygon class="st25" points="179.873,151.084 207.49,136.467 207.49,154.768 197.293,160.236 	"/><polyline class="st36" points="207.49,136.467 207.49,154.768 216.426,159.436 233.904,150.252 	"/><g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_59_" points="233.904,150.506 206.291,165.13 179.869,151.509 207.486,136.895 																																																					"/></defs>																									<clipPath id="SVGID_60_">																										<use xlink:href="#SVGID_59_"  style="overflow:visible;"/></clipPath>																									<polygon class="st26" points="229.01,151.272 207.496,162.369 185.967,151.272 207.5,140.177 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_61_" points="233.904,150.506 206.291,165.13 179.869,151.509 207.486,136.895 																																																					"/></defs>																									<clipPath id="SVGID_62_">																										<use xlink:href="#SVGID_61_"  style="overflow:visible;"/></clipPath>																									<polygon class="st65" points="229.01,168.296 229.01,151.272 207.496,162.369 207.496,178.849 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_63_" points="233.904,150.506 206.291,165.13 179.869,151.509 207.486,136.895 																																																					"/></defs>																									<clipPath id="SVGID_64_">																										<use xlink:href="#SVGID_63_"  style="overflow:visible;"/></clipPath>																									<polygon class="st131" points="207.496,162.369 185.967,151.272 185.967,167.846 207.496,178.849 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_65_" points="184.328,175.751 156.721,190.375 130.299,176.754 157.914,162.139 																																																					"/></defs>																									<clipPath id="SVGID_66_">																										<use xlink:href="#SVGID_65_"  style="overflow:visible;"/></clipPath>																									<polygon class="st68" points="179.438,176.517 157.924,187.614 136.393,176.517 157.928,165.424 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_67_" points="184.328,175.751 156.721,190.375 130.299,176.754 157.914,162.139 																																																					"/></defs>																									<clipPath id="SVGID_68_">																										<use xlink:href="#SVGID_67_"  style="overflow:visible;"/></clipPath>																									<polygon class="st159" points="179.438,193.54 179.438,176.517 157.924,187.614 157.924,204.096 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_69_" points="184.328,175.751 156.721,190.375 130.299,176.754 157.914,162.139 																																																					"/></defs>																									<clipPath id="SVGID_70_">																										<use xlink:href="#SVGID_69_"  style="overflow:visible;"/></clipPath>																									<polygon class="st44" points="157.924,187.614 136.393,176.517 136.393,193.092 157.924,204.096 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<polygon class="st101" points="107.68,58.748 58.904,84.371 34.504,71.792 83.293,46.178 	"/><polygon class="st122" points="171.279,127.008 117.896,155.861 87.867,140.664 142.441,112.006 	"/><polygon class="st122" points="137.783,109.229 84.402,138.083 54.371,122.885 108.945,94.228 	"/><polygon class="st122" points="101.129,91.956 47.746,120.809 30.922,112.412 85.898,83.967 	"/><polygon class="st83" points="107.68,78.045 107.68,58.75 58.904,84.371 58.904,103.056 	"/><polygon class="st168" points="58.904,84.371 34.504,71.792 34.504,90.581 58.904,103.056 	"/><polygon class="st2" points="138.633,74.951 89.859,100.575 65.457,87.995 114.246,62.383 	"/><polygon class="st24" points="138.633,94.248 138.633,74.953 89.859,100.575 89.859,119.26 	"/><polygon class="st132" points="89.859,100.575 65.457,87.995 65.457,106.785 89.859,119.26 	"/><polygon class="st54" points="169.584,91.155 120.812,116.778 96.41,104.2 145.197,78.586 	"/><polygon class="st33" points="169.584,110.452 169.584,91.157 120.812,116.778 120.812,135.464 	"/><polygon class="st102" points="120.812,116.778 96.41,104.2 96.41,122.988 120.812,135.464 	"/><use xlink:href="#Memcached"  width="66" height="66" x="-33" y="-33" transform="matrix(0.9586 0 0 -0.9586 363.457 60.0161)" style="overflow:visible;"/><use xlink:href="#Mongo"  width="65" height="65" x="-32.5" y="-32.5" transform="matrix(0.9586 0 0 -0.9586 288.2637 59.5376)" style="overflow:visible;"/><use xlink:href="#Ruby"  width="64.608" height="64.607" x="-32.304" y="-32.304" transform="matrix(0.9586 0 0 -0.9586 213.0723 59.3579)" style="overflow:visible;"/><text class="st48 st147 st170 st149"  transform="matrix(1 0 0 1 197.7168 14.3047)" class="st48">Ruby</text>	<g>		<text transform="matrix(1 0 0 1 261.6934 14.2988)" class="st147 st170 st149">MongoDB</text>	</g>	<text transform="matrix(1 0 0 1 330.2676 14.3047)" class="st147 st170 st149">Memcached</text></g><g id="build-cont-launches">			<use xlink:href="#YellowCode"  width="241.716" height="129.168" x="-120.858" y="-64.584" transform="matrix(1 0 0 -1 318.3408 198.415)" style="overflow:visible;"/><polygon class="st8" points="429.419,191.096 318.341,248.351 207.267,191.096 318.341,133.837 	"/><polygon class="st94" points="256.625,74.646 131.901,138.942 4.2,73.488 128.929,9.195 	"/><polygon class="st61" points="149.474,89.112 105.465,112.237 83.451,100.882 127.47,77.772 	"/><polygon class="st25" points="83.451,100.742 127.47,77.626 127.47,92.879 97.963,108.369 	"/><polyline class="st36" points="127.47,77.626 127.47,92.879 134.91,96.764 149.474,89.112 	"/><polygon class="st61" points="121.545,74.637 77.532,97.761 55.521,86.412 99.543,63.294 	"/><polygon class="st25" points="55.521,86.263 99.543,63.147 99.543,78.399 70.039,93.892 	"/><polyline class="st36" points="99.543,63.147 99.543,78.399 106.983,82.283 121.545,74.637 	"/><polygon class="st61" points="93.617,60.013 49.608,83.137 27.594,71.787 71.614,48.67 	"/><polygon class="st25" points="27.594,71.643 71.614,48.523 71.614,63.778 42.11,79.272 	"/><polyline class="st36" points="71.614,48.523 71.614,63.778 79.054,67.663 93.617,60.013 	"/><polygon class="st36" points="131.701,138.833 256.425,74.538 256.425,106.418 131.701,170.712 	"/><polygon class="st25" points="131.701,138.842 4,73.222 4,105.105 131.701,170.721 	"/><polygon class="st61" points="234.431,73.776 211.429,85.962 189.418,74.615 212.424,62.438 	"/><polygon class="st25" points="189.418,74.469 212.424,62.289 212.424,77.541 203.929,82.099 	"/><polyline class="st36" points="212.424,62.289 212.424,77.541 219.869,81.428 234.431,73.776 	"/><polygon class="st61" points="207.022,59.309 163.015,82.431 141.002,71.078 185.022,47.966 	"/><polyline class="st36" points="185.022,47.821 185.022,63.075 192.465,66.96 207.022,59.309 	"/><polygon class="st25" points="141.002,70.931 185.022,47.821 185.022,63.066 155.513,78.554 	"/><polygon class="st61" points="178.569,44.681 134.563,67.801 112.549,56.449 156.571,33.337 	"/><polygon class="st25" points="112.549,56.307 156.571,33.193 156.571,48.446 127.069,63.932 	"/><polyline class="st36" points="156.571,33.193 156.571,48.446 164.013,52.332 178.569,44.681 	"/><polygon class="st61" points="150.647,30.056 106.638,53.179 84.621,41.829 128.644,18.715 	"/><polygon class="st25" points="84.899,41.736 128.742,18.715 128.742,33.901 99.358,49.329 	"/><polyline class="st36" points="128.742,18.715 128.742,33.901 136.151,37.775 150.657,30.154 	"/><polygon class="st61" points="154.985,114.806 131.987,126.992 109.974,115.639 132.985,103.463 	"/><polygon class="st25" points="109.974,115.496 132.985,103.316 132.985,118.567 124.487,123.125 	"/><polyline class="st36" points="132.985,103.316 132.985,118.567 140.424,122.457 154.985,114.806 	"/><polygon class="st61" points="195.705,93.561 172.705,105.748 150.696,94.396 173.703,82.221 	"/><polygon class="st25" points="150.696,94.255 173.703,82.075 173.703,97.325 165.207,101.88 	"/><polyline class="st36" points="173.703,82.075 173.703,97.325 181.147,101.213 195.705,93.561 	"/><g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_71_" points="195.707,93.562 172.703,105.747 150.694,94.398 173.701,82.222 																																																					"/></defs>																									<clipPath id="SVGID_72_">																										<use xlink:href="#SVGID_71_"  style="overflow:visible;"/></clipPath>																									<polygon class="st35" points="191.631,94.201 173.709,103.447 155.772,94.201 173.711,84.957 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_73_" points="195.707,93.562 172.703,105.747 150.694,94.398 173.701,82.222 																																																					"/></defs>																									<clipPath id="SVGID_74_">																										<use xlink:href="#SVGID_73_"  style="overflow:visible;"/></clipPath>																									<polygon class="st79" points="191.631,108.385 191.631,94.201 173.709,103.447 173.709,117.179 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_75_" points="195.707,93.562 172.703,105.747 150.694,94.398 173.701,82.222 																																																					"/></defs>																									<clipPath id="SVGID_76_">																										<use xlink:href="#SVGID_75_"  style="overflow:visible;"/></clipPath>																									<polygon class="st155" points="173.709,103.447 155.772,94.201 155.772,108.011 173.709,117.179 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_77_" points="154.989,114.808 131.989,126.992 109.974,115.644 132.983,103.467 																																																					"/></defs>																									<clipPath id="SVGID_78_">																										<use xlink:href="#SVGID_77_"  style="overflow:visible;"/></clipPath>																									<polygon class="st80" points="150.912,115.446 132.991,124.692 115.054,115.446 132.992,106.203 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_79_" points="154.989,114.808 131.989,126.992 109.974,115.644 132.983,103.467 																																																					"/></defs>																									<clipPath id="SVGID_80_">																										<use xlink:href="#SVGID_79_"  style="overflow:visible;"/></clipPath>																									<polygon class="st17" points="150.912,129.63 150.912,115.446 132.991,124.692 132.991,138.425 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_81_" points="154.989,114.808 131.989,126.992 109.974,115.644 132.983,103.467 																																																					"/></defs>																									<clipPath id="SVGID_82_">																										<use xlink:href="#SVGID_81_"  style="overflow:visible;"/></clipPath>																									<polygon class="st55" points="132.991,124.692 115.054,115.446 115.054,129.256 132.991,138.425 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>			<linearGradient id="SVGID_83_" gradientUnits="userSpaceOnUse" x1="-1714.0527" y1="10067.627" x2="-1714.0527" y2="9962.4072" gradientTransform="matrix(1 0 0 -1 1856 10084.5)">		<stop  offset="0" style="stop-color:#23D5DB;stop-opacity:0"/><stop  offset="1" style="stop-color:#23D5DB"/></linearGradient>	<polygon class="st121" points="150.908,115.898 150.908,4 132.985,13.246 132.985,124.692 	"/><linearGradient id="SVGID_84_" gradientUnits="userSpaceOnUse" x1="-1731.98" y1="10067.627" x2="-1731.98" y2="9962.4072" gradientTransform="matrix(1 0 0 -1 1856 10084.5)">		<stop  offset="0" style="stop-color:#23D5DB;stop-opacity:0"/><stop  offset="1" style="stop-color:#148EA3"/></linearGradient>	<polygon class="st50" points="132.985,13.246 115.054,4 115.054,115.524 132.985,124.692 	"/><g>		<g>			<line class="st47" x1="215.532" y1="157.62" x2="214.181" y2="156.97"/><line class="st52" x1="212.364" y1="156.096" x2="149.679" y2="125.95"/><line class="st47" x1="148.771" y1="125.513" x2="147.418" y2="124.863"/><g>				<path class="st108" d="M143.612,123.032c2.109,0.197,4.879,0.132,6.834-0.407l-2.527,2.479l-0.354,3.521					C146.761,126.761,145.082,124.558,143.612,123.032z"/></g>		</g>	</g>	<g>		<g>			<line class="st47" x1="215.532" y1="200.019" x2="214.192" y2="199.346"/><line class="st99" x1="212.338" y1="198.417" x2="180.836" y2="182.627"/><polyline class="st47" points="179.91,182.163 178.569,181.49 178.187,180.04 			"/><line class="st18" x1="177.683" y1="178.134" x2="166.621" y2="136.196"/><line class="st47" x1="166.369" y1="135.243" x2="165.987" y2="133.793"/></g>	</g>			<use xlink:href="#YellowCode"  width="241.716" height="129.168" x="-120.858" y="-64.584" transform="matrix(1 0 0 -1 318.3408 168.7314)" style="overflow:visible;"/></g><g id="nanobox-initializes">	<polygon class="st94" points="352,98.674 180.048,187.15 4,97.084 175.951,8.608 	"/><polygon class="st61" points="204.276,118.579 143.604,150.403 113.254,134.776 173.939,102.974 	"/><polygon class="st25" points="113.254,134.583 173.939,102.775 173.939,123.761 133.26,145.081 	"/><polyline class="st36" points="173.939,102.775 173.939,123.761 184.196,129.107 204.276,118.579 	"/><polygon class="st61" points="165.773,98.66 105.098,130.481 74.747,114.862 135.436,83.053 	"/><polygon class="st25" points="74.747,114.66 135.436,82.851 135.436,103.84 94.762,125.156 	"/><polyline class="st36" points="135.436,82.851 135.436,103.84 145.697,109.186 165.773,98.66 	"/><polygon class="st61" points="127.27,78.539 66.597,110.359 36.248,94.738 96.934,62.932 	"/><polygon class="st25" points="36.248,94.541 96.934,62.728 96.934,83.719 56.255,105.037 	"/><polyline class="st36" points="96.934,62.728 96.934,83.719 107.191,89.063 127.27,78.539 	"/><polygon class="st36" points="180.048,187.115 352,98.642 352,142.511 180.048,230.984 	"/><polygon class="st25" points="180.048,187.115 4,96.82 4,140.692 180.048,230.984 	"/><polygon class="st61" points="268.417,124.735 236.708,141.507 206.361,125.887 238.081,109.129 	"/><polygon class="st25" points="206.361,125.688 238.081,108.927 238.081,129.915 226.371,136.185 	"/><polyline class="st36" points="238.081,108.927 238.081,129.915 248.344,135.267 268.417,124.735 	"/><polygon class="st61" points="282.899,77.359 222.229,109.183 191.878,93.559 252.562,61.748 	"/><polygon class="st25" points="191.878,93.359 252.562,61.56 252.562,82.535 211.884,103.854 	"/><polyline class="st36" points="252.562,61.56 252.562,82.535 262.823,87.885 282.899,77.359 	"/><polygon class="st61" points="244.392,57.437 183.722,89.257 153.37,73.633 214.059,41.831 	"/><polygon class="st25" points="153.37,73.437 214.059,41.629 214.059,62.618 173.385,83.93 	"/><polyline class="st36" points="214.059,41.629 214.059,62.618 224.318,67.964 244.392,57.437 	"/><polygon class="st61" points="205.895,37.316 145.221,69.133 114.866,53.515 175.559,21.707 	"/><polygon class="st25" points="114.866,53.317 175.559,21.512 175.559,42.493 134.883,63.812 	"/><polyline class="st36" points="175.559,21.512 175.559,42.493 185.817,47.846 205.895,37.316 	"/><polygon class="st61" points="321.237,97.394 289.532,114.163 259.184,98.544 290.904,81.787 	"/><polygon class="st25" points="259.184,98.347 290.904,81.586 290.904,102.572 279.191,108.841 	"/><polyline class="st36" points="290.904,81.586 290.904,102.572 301.165,107.925 321.237,97.394 	"/><polygon class="st61" points="211.874,153.935 180.169,170.705 149.82,155.085 181.54,138.328 	"/><polygon class="st25" points="149.82,154.889 181.54,138.126 181.54,159.113 169.83,165.385 	"/><polyline class="st36" points="181.54,138.126 181.54,159.113 191.804,164.465 211.874,153.935 	"/><g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_85_" points="268.417,124.735 236.708,141.507 206.361,125.887 238.081,109.129 																																																					"/></defs>																									<clipPath id="SVGID_86_">																										<use xlink:href="#SVGID_85_"  style="overflow:visible;"/></clipPath>																									<polygon class="st76" points="262.803,125.616 238.092,138.335 213.361,125.616 238.093,112.896 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_87_" points="268.417,124.735 236.708,141.507 206.361,125.887 238.081,109.129 																																																					"/></defs>																									<clipPath id="SVGID_88_">																										<use xlink:href="#SVGID_87_"  style="overflow:visible;"/></clipPath>																									<polygon class="st125" points="262.803,145.133 262.803,125.616 238.092,138.335 238.092,157.237 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<defs>																										<polygon id="SVGID_89_" points="268.417,124.735 236.708,141.507 206.361,125.887 238.081,109.129 																																																					"/></defs>																									<clipPath id="SVGID_90_">																										<use xlink:href="#SVGID_89_"  style="overflow:visible;"/></clipPath>																									<polygon class="st37" points="238.092,138.335 213.361,125.616 213.361,144.621 238.092,157.237 																																																			"/></g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>			<linearGradient id="SVGID_91_" gradientUnits="userSpaceOnUse" x1="-1605.561" y1="10057.6367" x2="-1605.5613" y2="9948.3066" gradientTransform="matrix(1 0 0 -1 1856 10084.5)">		<stop  offset="0" style="stop-color:#CF9115;stop-opacity:0"/><stop  offset="1" style="stop-color:#CF9115"/></linearGradient>	<polygon class="st49" points="262.794,125.618 262.794,4 238.084,16.724 238.084,138.335 	"/><linearGradient id="SVGID_92_" gradientUnits="userSpaceOnUse" x1="-1630.2773" y1="10057.6348" x2="-1630.2773" y2="9948.3047" gradientTransform="matrix(1 0 0 -1 1856 10084.5)">		<stop  offset="0" style="stop-color:#B57902;stop-opacity:0"/><stop  offset="1" style="stop-color:#B57902"/></linearGradient>	<polygon class="st163" points="238.084,16.724 213.36,4 213.36,125.72 238.084,138.335 	"/></g><g id="vagrant-initializes">	<polygon class="st140" points="321,86.084 164.365,166.719 4,84.635 160.634,4 	"/><polygon class="st140" points="186.434,104.228 131.169,133.226 103.521,118.991 158.803,90.003 	"/><polyline class="st140" points="138.251,137.335 167.119,122.073 167.119,141.182 156.462,146.893 	"/><line class="st140" x1="167.119" y1="141.182" x2="176.458" y2="146.055"/><line class="st140" x1="194.725" y1="136.467" x2="167.119" y2="122.073"/><polyline class="st140" points="194.725,136.467 165.901,151.572 138.251,137.335 	"/><polyline class="st140" points="187.958,111.634 216.825,96.371 216.825,115.48 206.168,121.191 	"/><line class="st140" x1="216.825" y1="115.48" x2="226.165" y2="120.353"/><line class="st140" x1="244.431" y1="110.765" x2="216.825" y2="96.371"/><polyline class="st140" points="244.431,110.765 215.607,125.87 187.958,111.634 	"/><polyline class="st140" points="236.676,85.932 265.543,70.669 265.543,89.778 254.887,95.489 	"/><line class="st140" x1="265.543" y1="89.778" x2="274.883" y2="94.651"/><line class="st140" x1="293.149" y1="85.063" x2="265.543" y2="70.669"/><polyline class="st140" points="293.149,85.063 264.326,100.167 236.676,85.932 	"/><polyline class="st140" points="158.803,89.822 158.803,108.948 121.75,128.377 	"/><line class="st140" x1="158.803" y1="108.948" x2="168.147" y2="113.822"/><polygon class="st140" points="151.362,86.073 96.097,115.07 68.451,100.834 123.729,71.85 	"/><polyline class="st140" points="123.729,71.666 123.729,90.792 86.679,110.22 	"/><line class="st140" x1="123.729" y1="90.792" x2="133.077" y2="95.665"/><polygon class="st140" points="116.29,67.733 61.026,96.734 33.377,82.496 88.658,53.51 	"/><polyline class="st140" points="88.658,53.327 88.658,72.453 51.605,91.882 	"/><line class="st140" x1="88.658" y1="72.453" x2="98.003" y2="77.327"/><polyline class="st140" points="321,86.295 321,125.364 164.365,206 164.365,166.929 	"/><polyline class="st140" points="4,84.637 4,123.706 164.365,206 	"/><polygon class="st140" points="258.052,66.658 202.788,95.659 175.141,81.421 230.422,52.435 	"/><polyline class="st140" points="230.422,52.253 230.422,71.376 193.371,90.806 	"/><line class="st140" x1="230.422" y1="71.376" x2="239.767" y2="76.25"/><polygon class="st140" points="222.98,48.502 167.717,77.501 140.068,63.264 195.349,34.276 	"/><polyline class="st140" points="195.349,34.096 195.349,53.221 158.296,72.65 	"/><line class="st140" x1="195.349" y1="53.221" x2="204.693" y2="58.095"/><polygon class="st140" points="187.908,30.164 132.643,59.161 104.997,44.925 160.275,15.938 	"/><polyline class="st140" points="160.275,15.757 160.275,34.883 123.225,54.312 	"/><line class="st140" x1="160.275" y1="34.883" x2="169.624" y2="39.755"/></g><g id="add-btn">	<line class="st146" x1="35.549" y1="26.122" x2="35.549" y2="54.958"/><line class="st146" x1="21.131" y1="40.54" x2="49.967" y2="40.54"/><polygon class="st167" points="67.104,58.652 35.551,76.869 4,58.652 4,22.215 35.551,4 67.104,22.218 	"/></g><g id="engine-icon">	<polygon class="st95" points="14.313,29.11 35.376,41.287 56.727,28.972 56.718,28.12 35.553,15.886 14.316,28.12 	"/><polygon class="st67" points="56.727,52.571 35.512,64.819 34.739,64.356 34.739,40.801 56.727,28.107 	"/><polygon  class="outline st96" points="67.105,58.653 35.553,76.869 4,58.653 4,22.215 35.553,4 67.105,22.218 	"/><polygon class="st62" points="14.316,52.585 35.49,64.788 35.49,40.323 14.316,28.12 	"/></g><g id="close-btn">	<path class="st104" d="M22.915,21.37c0.221,0.219,0.328,0.48,0.328,0.781c0,0.303-0.107,0.562-0.328,0.781		c-0.219,0.219-0.479,0.328-0.809,0.328c-0.271,0-0.527-0.109-0.771-0.328l-7.688-7.693l-7.732,7.693		c-0.219,0.219-0.469,0.328-0.752,0.328c-0.18,0-0.334-0.029-0.463-0.086c-0.129-0.062-0.252-0.146-0.367-0.242		c-0.219-0.229-0.326-0.479-0.326-0.781c0-0.301,0.107-0.562,0.326-0.781l7.695-7.688L4.333,5.953C4.229,5.85,4.149,5.729,4.104,5.6		C4.042,5.453,4,5.311,4,5.156s0.029-0.301,0.104-0.443c0.059-0.141,0.139-0.27,0.229-0.385C4.562,4.109,4.815,4,5.124,4		c0.312,0,0.572,0.109,0.791,0.328l7.732,7.771l7.688-7.771C21.563,4.109,21.817,4,22.126,4c0.312,0,0.57,0.109,0.789,0.328		c0.104,0.115,0.188,0.244,0.232,0.385c0.051,0.146,0.076,0.289,0.076,0.443S23.198,5.459,23.147,5.6		c-0.053,0.143-0.129,0.264-0.232,0.354l-7.713,7.729L22.915,21.37z"/></g><g id="logo-horizontal">	<g  class="logotype" >		<path class="st182" d="M50.691,9.968l8.918,12.938h0.043V9.968h1.458v15.307h-1.629l-8.918-12.949h-0.043v12.949h-1.458V9.968			H50.691z"/><path class="st182" d="M74.145,9.968l6.004,15.307h-1.561l-1.865-4.76h-6.964l-1.854,4.76h-1.543l6.155-15.307H74.145z			 M76.225,19.271l-2.959-7.847l-3.064,7.847H76.225z"/><path class="st182" d="M87.008,9.968l8.918,12.938h0.043V9.968h1.459v15.307h-1.631l-8.918-12.949h-0.043v12.949h-1.457V9.968			H87.008z"/><path class="st182" d="M103.986,14.598c0.301-0.957,0.75-1.812,1.354-2.54c0.6-0.736,1.354-1.321,2.262-1.758			c0.906-0.438,1.961-0.654,3.162-0.654c1.198,0,2.25,0.219,3.146,0.654c0.9,0.437,1.65,1.021,2.252,1.758			c0.604,0.729,1.06,1.583,1.354,2.54c0.301,0.958,0.451,1.966,0.451,3.021c0,1.062-0.15,2.065-0.451,3.022			c-0.299,0.958-0.75,1.801-1.354,2.521c-0.602,0.729-1.352,1.312-2.252,1.747c-0.896,0.438-1.94,0.653-3.146,0.653			s-2.256-0.219-3.162-0.653c-0.908-0.436-1.662-1.019-2.262-1.747c-0.604-0.729-1.061-1.562-1.354-2.521			c-0.301-0.957-0.449-1.979-0.449-3.022S103.688,15.556,103.986,14.598z M105.326,20.075c0.229,0.812,0.564,1.53,1.029,2.166			s1.062,1.146,1.791,1.532c0.729,0.386,1.6,0.579,2.615,0.579c1.014,0,1.883-0.193,2.604-0.579			c0.729-0.386,1.314-0.896,1.779-1.532c0.463-0.636,0.809-1.354,1.027-2.166c0.223-0.807,0.334-1.625,0.334-2.454			c0-0.844-0.111-1.665-0.334-2.466c-0.221-0.8-0.564-1.519-1.027-2.154c-0.465-0.636-1.059-1.146-1.779-1.521			c-0.723-0.396-1.592-0.578-2.604-0.578c-1.016,0-1.887,0.188-2.615,0.578c-0.729,0.387-1.326,0.896-1.791,1.521			c-0.465,0.646-0.809,1.354-1.029,2.154c-0.221,0.801-0.332,1.622-0.332,2.466C104.994,18.45,105.105,19.269,105.326,20.075z"/><path class="st182" d="M130.57,9.968c0.643,0,1.262,0.061,1.854,0.182c0.594,0.122,1.104,0.329,1.562,0.622			c0.449,0.293,0.812,0.679,1.082,1.157c0.271,0.479,0.408,1.062,0.408,1.789c0,0.396-0.064,0.775-0.193,1.17			c-0.129,0.379-0.311,0.722-0.547,1.021c-0.232,0.312-0.514,0.567-0.836,0.782c-0.322,0.214-0.684,0.364-1.082,0.45v0.043			c0.984,0.128,1.771,0.521,2.357,1.211c0.586,0.679,0.879,1.519,0.879,2.52c0,0.243-0.021,0.521-0.064,0.825			c-0.043,0.312-0.129,0.621-0.258,0.943c-0.127,0.312-0.312,0.64-0.557,0.954c-0.244,0.312-0.568,0.589-0.98,0.812			c-0.406,0.232-0.906,0.438-1.5,0.575c-0.594,0.15-1.305,0.229-2.133,0.229h-6.479V9.966h6.479V9.98L130.57,9.968L130.57,9.968z			 M130.57,16.678c0.586,0,1.094-0.067,1.521-0.204c0.43-0.146,0.785-0.321,1.061-0.562c0.287-0.229,0.5-0.512,0.646-0.82			c0.143-0.312,0.215-0.646,0.215-1.013c0-1.915-1.15-2.873-3.451-2.873h-5.018v5.479L130.57,16.678L130.57,16.678z M130.57,24.031			c0.543,0,1.059-0.047,1.543-0.14c0.486-0.104,0.914-0.271,1.287-0.504c0.371-0.243,0.664-0.568,0.879-0.979			c0.213-0.407,0.32-0.918,0.32-1.532c0-0.979-0.346-1.727-1.039-2.219c-0.693-0.493-1.689-0.74-2.99-0.74h-5.018v6.11			L130.57,24.031L130.57,24.031z"/><path class="st182" d="M141.891,14.598c0.299-0.957,0.75-1.812,1.35-2.54c0.605-0.736,1.355-1.321,2.271-1.758			c0.896-0.438,1.961-0.654,3.16-0.654c1.188,0,2.252,0.219,3.145,0.654c0.9,0.437,1.65,1.021,2.25,1.758			c0.605,0.729,1.051,1.583,1.355,2.54c0.301,0.958,0.438,1.966,0.438,3.021c0,1.062-0.145,2.065-0.438,3.022			c-0.312,0.958-0.75,1.801-1.355,2.521c-0.6,0.729-1.35,1.312-2.25,1.747c-0.895,0.438-1.951,0.653-3.145,0.653			c-1.199,0-2.271-0.219-3.16-0.653c-0.908-0.436-1.662-1.019-2.271-1.747c-0.6-0.729-1.051-1.562-1.35-2.521			c-0.301-0.957-0.451-1.979-0.451-3.022S141.59,15.556,141.891,14.598z M143.229,20.075c0.223,0.812,0.564,1.53,1.029,2.166			s1.061,1.146,1.791,1.532c0.729,0.386,1.6,0.579,2.613,0.579c1.016,0,1.885-0.193,2.604-0.579s1.312-0.896,1.779-1.532			c0.465-0.636,0.807-1.354,1.02-2.166c0.23-0.807,0.334-1.625,0.334-2.454c0-0.844-0.104-1.665-0.334-2.466			c-0.221-0.8-0.561-1.519-1.02-2.154c-0.465-0.635-1.062-1.146-1.779-1.521c-0.723-0.396-1.59-0.578-2.604-0.578			c-1.021,0-1.896,0.188-2.613,0.578c-0.73,0.387-1.326,0.896-1.791,1.521c-0.465,0.646-0.812,1.354-1.029,2.154			c-0.221,0.801-0.332,1.622-0.332,2.466C142.896,18.45,143.008,19.269,143.229,20.075z"/><path class="st182" d="M162.234,9.968l4.33,6.396l4.48-6.396h1.629l-5.23,7.46l5.531,7.847h-1.758l-4.652-6.753l-4.717,6.753			h-1.629l5.479-7.891l-5.188-7.416H162.234z"/></g>	<g  class="top" >		<polygon class="st53" points="29.647,10.61 16.823,17.22 4,10.61 16.823,4 		"/></g>	<g  class="right" >		<polygon class="st158" points="16.823,31.026 29.647,24.417 29.647,26.343 16.823,32.954 		"/><polygon class="st158" points="16.823,26.425 29.647,19.814 29.647,21.741 16.823,28.353 		"/><polygon class="st158" points="16.823,21.822 29.647,15.213 29.647,17.14 16.823,23.751 		"/><polygon class="st158" points="16.823,17.22 29.647,10.61 29.647,12.538 16.823,19.149 		"/></g>	<g  class="left" >		<polygon class="st94" points="16.823,31.026 4,24.417 4,26.343 16.823,32.954 		"/><polygon class="st94" points="16.823,26.425 4,19.814 4,21.741 16.823,28.353 		"/><polygon class="st94" points="16.823,21.822 4,15.213 4,17.14 16.823,23.751 		"/><polygon class="st94" points="16.823,17.22 4,10.61 4,12.538 16.823,19.149 		"/></g></g><g id="sandwich">	<g>		<polygon class="st94" points="462.834,411.293 316.008,486.976 165.688,409.937 312.51,334.256 		"/><polygon class="st61" points="336.699,428.321 284.891,455.544 258.977,442.177 310.793,414.974 		"/><polygon class="st25" points="258.977,442.013 310.793,414.801 310.793,432.755 276.059,450.991 		"/><polyline class="st36" points="310.793,414.801 310.793,432.755 319.553,437.327 336.699,428.321 		"/><polygon class="st61" points="303.822,411.284 252.012,438.505 226.098,425.144 277.914,397.935 		"/><polygon class="st25" points="226.098,424.969 277.914,397.758 277.914,415.713 243.186,433.946 		"/><polyline class="st36" points="277.914,397.758 277.914,415.713 286.68,420.287 303.822,411.284 		"/><polygon class="st61" points="270.945,394.071 219.137,421.289 193.223,407.928 245.039,380.722 		"/><polygon class="st25" points="193.223,407.76 245.039,380.548 245.039,398.502 210.307,416.735 		"/><polyline class="st36" points="245.039,380.548 245.039,398.502 253.799,403.075 270.945,394.071 		"/><polygon class="st36" points="316.008,486.876 462.834,411.198 462.834,432.808 316.008,508.485 		"/><polygon class="st25" points="316.008,486.876 165.688,409.64 165.688,431.251 316.008,508.485 		"/><polygon class="st61" points="419.471,419.203 351.174,454.724 325.264,441.364 393.568,405.854 		"/><polygon class="st25" points="325.279,441.356 410.695,396.696 410.695,414.647 342.512,450.267 		"/><polygon class="st61" points="403.832,393.062 352.027,420.284 326.113,406.92 377.93,379.708 		"/><polygon class="st25" points="326.113,406.748 377.93,379.548 377.93,397.491 343.195,415.726 		"/><polyline class="st36" points="377.93,379.548 377.93,397.491 386.689,402.067 403.832,393.062 		"/><polygon class="st61" points="370.951,376.021 319.148,403.239 293.23,389.875 345.049,362.672 		"/><polygon class="st25" points="293.23,389.707 345.049,362.501 345.049,380.454 310.32,398.683 		"/><polyline class="st36" points="345.049,362.501 345.049,380.454 353.812,385.025 370.951,376.021 		"/><polygon class="st61" points="338.078,358.81 286.273,386.026 260.354,372.667 312.176,345.458 		"/><polygon class="st25" points="260.354,372.497 312.176,345.292 312.176,363.237 277.443,381.475 		"/><polyline class="st36" points="312.176,345.292 312.176,363.237 320.936,367.818 338.078,358.81 		"/><g>			<polyline class="st36" points="410.666,396.678 410.666,414.629 419.432,419.209 436.568,410.2 			"/></g>		<g>			<polygon class="st61" points="343.186,458.565 316.113,472.911 290.199,459.55 317.283,445.214 			"/><polygon class="st25" points="290.199,459.382 317.283,445.044 317.283,462.993 307.283,468.36 			"/><polyline class="st36" points="317.283,445.044 317.283,462.993 326.047,467.571 343.186,458.565 			"/></g>		<polygon class="st51" points="419.316,389.303 312.52,444.349 205.723,389.303 312.52,334.256 		"/></g>	<polygon class="st112" points="333.631,268.14 282.047,295.241 256.242,281.937 307.84,254.847 	"/><polygon class="st43" points="333.631,288.549 333.631,268.14 282.047,295.241 282.047,315.004 	"/><polygon class="st20" points="282.047,295.241 256.242,281.937 256.242,301.809 282.047,315.004 	"/><polygon class="st112" points="272.639,300.021 221.055,327.123 195.246,313.818 246.848,286.729 	"/><polygon class="st112" points="366.369,285.277 314.785,312.379 288.979,299.074 340.576,271.983 	"/><polygon class="st43" points="366.369,305.688 366.369,285.28 314.785,312.379 314.783,332.142 	"/><polygon class="st20" points="314.785,312.379 288.979,299.074 288.979,318.946 314.783,332.142 	"/><polygon class="st112" points="399.105,302.416 347.521,329.517 321.713,316.212 373.314,289.122 	"/><polygon class="st43" points="399.105,322.825 399.105,302.418 347.521,329.517 347.521,349.28 	"/><polygon class="st20" points="347.521,329.517 321.713,316.212 321.713,336.085 347.521,349.28 	"/><polygon class="st43" points="272.639,320.431 272.639,300.023 221.055,327.123 221.053,346.886 	"/><polygon class="st20" points="221.055,327.123 195.246,313.818 195.246,333.691 221.053,346.886 	"/><polygon class="st112" points="305.373,317.16 253.789,344.262 227.984,330.957 279.582,303.866 	"/><polygon class="st43" points="305.373,337.569 305.373,317.161 253.789,344.262 253.787,364.024 	"/><polygon class="st20" points="253.789,344.262 227.984,330.957 227.984,350.829 253.787,364.024 	"/><polygon class="st112" points="338.111,334.298 286.527,361.399 260.721,348.095 312.32,321.005 	"/><polygon class="st43" points="338.111,354.708 338.111,334.3 286.527,361.399 286.527,381.162 	"/><polygon class="st20" points="286.527,361.399 260.721,348.095 260.721,367.968 286.527,381.162 	"/><g>		<polygon class="st112" points="430.412,316.193 345.074,360.927 323.957,350.048 409.314,305.313 		"/><polygon class="st43" points="430.412,336.073 430.412,316.193 345.074,360.927 345.074,380.28 		"/><polygon class="st20" points="345.074,360.927 323.957,350.048 323.957,369.487 345.074,380.28 		"/></g>	<g>		<polygon class="st164" points="418.898,310.256 319.152,362.262 309.633,357.369 301.951,361.34 301.92,353.334 276.164,339.987 			268.988,343.711 268.992,336.272 243.258,322.938 236.119,326.685 236.086,319.225 210.318,305.872 246.846,286.724 			256.271,291.551 256.242,281.937 307.535,254.905 366.369,285.265 366.393,292.703 373.316,289.119 381.219,293.196 			399.105,302.416 399.111,310.647 409.314,305.313 		"/><polygon class="st119" points="337.045,384.89 337.045,365.012 336.074,364.511 315.947,374.889 315.947,395.243 		"/><polygon class="st137" points="315.947,374.889 295.797,364.511 294.828,365.012 294.828,384.452 315.947,395.243 		"/><polygon class="st5" points="337.045,365.012 315.947,375.89 294.828,365.012 315.947,354.13 		"/></g>	<polyline class="st141" points="336.492,365.256 336.492,311.496 462.455,246.631 462.455,215.852 	"/><polyline class="st141" points="294.479,365.256 294.479,311.496 172.752,248.751 172.752,215.852 	"/><polygon class="st180" points="317.514,268.806 462.564,194.041 462.564,215.852 317.514,290.614 	"/><polygon class="st19" points="317.514,268.806 172.461,194.041 172.461,215.852 317.514,290.614 	"/><polygon class="st10" points="462.564,194.041 317.514,268.806 172.461,194.041 317.514,119.277 	"/><polygon class="st7" points="424.311,174.417 317.514,229.462 210.715,174.417 317.514,119.37 	"/><g>		<polygon class="st38" points="316.508,153.538 461.566,78.771 462.537,79.271 462.537,101.229 316.508,176.496 		"/><polygon class="st172" points="316.508,153.538 171.449,78.771 170.479,79.271 170.479,101.229 316.508,176.496 		"/><polygon class="st108" points="462.537,79.271 316.508,154.539 170.479,79.271 316.508,4 		"/><polygon class="st156" points="234.639,67.035 205.574,81.996 200.393,79.269 229.459,64.306 		"/><polygon class="st72" points="265.734,60.51 224.832,81.592 219.654,78.865 260.555,57.78 		"/><polygon class="st72" points="274.973,65.273 234.074,86.354 228.893,83.626 269.793,62.544 		"/><polygon class="st72" points="284.211,70.032 243.314,91.117 238.131,88.39 279.033,67.306 		"/><polygon class="st156" points="276.822,88.797 247.756,103.758 242.576,101.032 271.645,86.071 		"/><polygon class="st72" points="307.918,82.273 267.02,103.355 261.838,100.629 302.74,79.544 		"/><polygon class="st72" points="317.158,87.037 276.256,108.119 271.076,105.39 311.979,84.309 		"/><polygon class="st72" points="326.398,91.798 285.496,112.881 280.316,110.152 321.217,89.071 		"/><polygon class="st156" points="317.543,109.784 288.479,124.744 283.297,122.02 312.365,107.056 		"/><polygon class="st72" points="348.641,103.261 307.74,124.343 302.559,121.615 343.459,100.53 		"/><polygon class="st72" points="357.879,108.024 316.98,129.106 311.797,126.377 352.699,105.297 		"/><polygon class="st72" points="367.117,112.785 326.217,133.865 321.037,131.14 361.939,110.056 		"/><polygon class="st156" points="299.936,33.699 270.871,48.662 265.691,45.934 294.754,30.972 		"/><polygon class="st72" points="331.033,27.176 290.129,48.258 284.951,45.53 325.854,24.446 		"/><polygon class="st72" points="340.27,31.939 299.371,53.02 294.191,50.292 335.09,29.21 		"/><polygon class="st72" points="349.508,36.698 308.611,57.782 303.43,55.056 344.33,33.971 		"/><polygon class="st156" points="342.119,55.463 313.055,70.424 307.873,67.698 336.943,52.735 		"/><polygon class="st72" points="373.217,48.939 332.318,70.021 327.137,67.294 368.035,46.211 		"/><polygon class="st72" points="382.455,53.703 341.555,74.785 336.373,72.056 377.275,50.976 		"/><polygon class="st72" points="391.695,58.464 350.793,79.544 345.615,76.818 386.516,55.736 		"/><polygon class="st156" points="382.84,76.446 353.775,91.41 348.596,88.684 377.662,73.722 		"/><polygon class="st72" points="413.939,69.928 373.037,91.01 367.857,88.28 408.756,67.196 		"/><polygon class="st72" points="423.178,74.689 382.277,95.772 377.096,93.043 417.996,71.963 		"/><polygon class="st72" points="432.416,79.451 391.518,100.53 386.334,97.806 427.238,76.722 		"/></g>	<g id="arrows">		<g>			<g>				<polyline class="st31" points="5.994,128.803 43.777,91.021 153.375,91.021 				"/><g>					<path class="st111" d="M152.975,91.021c-1.045-1.045-1.543-3.104-1.584-4.545c1.432,1.925,3.293,3.604,5.547,4.545						c-2.254,0.901-4.033,2.688-5.547,4.545C151.514,94.03,151.889,92.167,152.975,91.021z"/></g>			</g>		</g>		<g>			<g>				<polyline class="st31" points="4,286.217 30.576,286.217 112.035,204.758 153.375,204.758 				"/><g>					<path class="st111" d="M152.975,204.758c-1.045-1.045-1.543-3.111-1.584-4.545c1.432,1.925,3.293,3.604,5.547,4.545						c-2.254,0.901-4.033,2.682-5.547,4.545C151.514,207.768,151.889,205.905,152.975,204.758z"/></g>			</g>		</g>		<g>			<g>				<polyline class="st31" points="559.424,364.639 501.986,422.074 480.551,422.074 				"/><g>					<path class="st111" d="M480.953,422.074c1.045,1.045,1.543,3.104,1.584,4.545c-1.434-1.938-3.295-3.604-5.547-4.545						c2.252-0.901,4.031-2.688,5.547-4.558C482.414,419.064,482.039,420.928,480.953,422.074z"/></g>			</g>		</g>		<g>			<g>				<polyline class="st31" points="559.223,249.842 480.988,328.076 445.551,328.076 				"/><g>					<path class="st111" d="M445.953,328.076c1.045,1.045,1.543,3.104,1.584,4.545c-1.434-1.925-3.295-3.604-5.547-4.545						c2.252-0.901,4.031-2.688,5.547-4.545C447.414,325.066,447.039,326.93,445.953,328.076z"/></g>			</g>		</g>	</g>	<g id="numbers-staggered">		<text transform="matrix(1 0 0 1 148.584 95.5869)" class="st108 st178 st153">1</text>		<text transform="matrix(1 0 0 1 146.584 210.5791)" class="st10 st178 st153">2</text>		<text transform="matrix(1 0 0 1 439.2168 334.1211)" class="st112 st178 st153">3</text>		<text transform="matrix(1 0 0 1 475.4922 430.1045)" class="st113 st178 st153">4</text>	</g>	<g id="numbers-vertical">		<text transform="matrix(1 0 0 1 148.584 95.5869)" class="st108 st178 st153">1</text>		<text transform="matrix(1 0 0 1 146.584 210.5791)" class="st10 st178 st153">2</text>		<text transform="matrix(1 0 0 1 147.0996 321.5693)" class="st112 st178 st153">3</text>		<text transform="matrix(1 0 0 1 146.1055 422.0977)" class="st0 st178 st153">4</text>	</g></g><g id="push-pagoda">			<use xlink:href="#mini-stack_1_"  width="87.77" height="149.102" x="-43.885" y="-74.551" transform="matrix(1 0 0 -1 47.8848 93.0332)" style="overflow:visible;"/><circle class="st169" cx="223.048" cy="85.002" r="81.002"/><polygon class="st21" points="201.391,56.609 183.69,66.525 180.624,88.668 204.908,135.047 204.896,135.042 228.341,149.398 		228.341,73.118 	"/><polygon class="st60" points="215.781,31.016 194.632,52.474 228.341,73.118 259.066,54.096 	"/><polygon class="st46" points="201.391,56.609 228.341,90.696 239.994,65.901 	"/><polygon class="st97" points="215.781,31.016 201.391,56.609 183.69,66.525 194.632,52.474 	"/><polygon class="st174" points="259.066,54.096 259.066,54.096 228.341,91.206 228.341,149.398 273.14,79.146 	"/><polygon class="st9" points="228.341,90.696 204.908,104.951 204.908,135.047 228.341,149.398 239.5,109.892 	"/><polygon class="st13" points="239.994,65.901 259.066,54.096 273.14,79.146 239.5,109.892 228.341,90.696 	"/><polygon class="st12" points="204.908,135.047 228.341,90.696 204.908,104.951 	"/><polyline class="st22" points="201.391,56.609 204.908,104.951 228.341,90.696 	"/><polygon class="st56" points="215.781,31.016 201.391,56.609 183.69,66.525 194.632,52.474 	"/><text transform="matrix(1 0 0 1 21.3032 214.75)" class="st156 st116 st154">$ git push pagoda</text>	<g>		<g>			<line class="st74" x1="67.312" y1="93.108" x2="154.833" y2="93.108"/><g>				<path class="st10" d="M159.059,93.108c-1.988,0.738-4.454,1.996-5.983,3.329l1.205-3.329l-1.205-3.329					C154.604,91.112,157.07,92.372,159.059,93.108z"/></g>		</g>	</g>	<g>		<g>			<line class="st74" x1="90.465" y1="77.05" x2="154.833" y2="77.05"/><g>				<path class="st10" d="M159.059,77.05c-1.988,0.738-4.454,1.996-5.983,3.329l1.205-3.329l-1.205-3.329					C154.604,75.054,157.07,76.312,159.059,77.05z"/></g>		</g>	</g>	<g>		<g>			<line class="st74" x1="83.204" y1="85.08" x2="154.833" y2="85.08"/><g>				<path class="st10" d="M159.059,85.08c-1.988,0.729-4.454,1.996-5.983,3.328l1.205-3.328l-1.205-3.329					C154.604,83.085,157.07,84.344,159.059,85.08z"/></g>		</g>	</g></g><g id="framework-sniff">	<g>		<path class="st160" d="M28.534,16.256c-0.268,0-0.512-0.052-0.732-0.156c-0.22-0.104-0.431-0.244-0.628-0.419l-3.695-3.713			c-0.187-0.186-0.326-0.398-0.419-0.637c-0.093-0.239-0.14-0.479-0.14-0.729s0.047-0.479,0.14-0.715			c0.093-0.229,0.232-0.436,0.419-0.604c0.186-0.188,0.397-0.329,0.636-0.438C24.354,8.747,24.594,8.7,24.839,8.7			s0.482,0.05,0.715,0.146c0.233,0.104,0.441,0.241,0.628,0.438l2.354,2.354l5.944-5.963c0.186-0.188,0.396-0.325,0.628-0.418			s0.474-0.14,0.724-0.14s0.49,0.047,0.724,0.14c0.232,0.093,0.441,0.229,0.627,0.418c0.187,0.187,0.323,0.396,0.41,0.628			s0.131,0.474,0.131,0.724s-0.044,0.491-0.131,0.729c-0.087,0.229-0.224,0.438-0.41,0.627l-7.305,7.305			c-0.174,0.175-0.375,0.314-0.602,0.419C29.049,16.211,28.801,16.256,28.534,16.256z"/></g>	<g>		<polygon class="st108" points="222.519,83.688 113.26,140.003 4,83.688 113.26,27.372 		"/><polygon class="st108" points="200.244,83.688 113.26,128.524 26.274,83.688 113.26,38.851 		"/><polygon class="st72" points="52.004,74.534 30.258,85.729 26.382,83.687 48.131,72.493 		"/><polygon class="st72" points="75.269,69.651 44.668,85.425 40.793,83.386 71.395,67.61 		"/><polygon class="st72" points="82.184,73.216 51.582,88.987 47.707,86.948 78.309,71.173 		"/><polygon class="st72" points="89.096,76.778 58.495,92.554 54.619,90.511 85.219,74.735 		"/><polygon class="st72" points="83.567,90.815 61.82,102.011 57.946,99.972 79.693,88.774 		"/><polygon class="st72" points="106.835,85.937 76.231,101.71 72.356,99.667 102.957,83.894 		"/><polygon class="st72" points="113.746,89.499 83.145,105.272 79.268,103.231 109.869,87.458 		"/><polygon class="st72" points="120.658,93.063 90.057,108.835 86.181,106.796 116.781,91.022 		"/><polygon class="st72" points="114.034,106.519 92.287,117.714 88.411,115.673 110.158,104.478 		"/><polygon class="st72" points="137.3,101.638 106.699,117.413 102.822,115.37 133.424,99.597 		"/><polygon class="st72" points="144.215,105.202 113.611,120.976 109.734,118.933 140.338,103.161 		"/><polygon class="st72" points="151.127,108.765 120.525,124.538 116.648,122.497 147.25,106.724 		"/><polygon class="st72" points="100.859,49.595 79.114,60.788 75.238,58.747 96.984,47.552 		"/><polygon class="st72" points="124.125,44.712 93.525,60.485 89.65,58.444 120.25,42.671 		"/><polygon class="st72" points="131.039,48.274 100.439,64.048 96.562,62.007 127.164,46.233 		"/><polygon class="st72" points="137.953,51.835 107.35,67.612 103.475,65.571 134.077,49.796 		"/><polygon class="st72" points="132.424,65.876 110.676,77.071 106.801,75.028 128.547,63.835 		"/><polygon class="st72" points="155.688,60.997 125.086,76.771 121.211,74.728 151.813,58.954 		"/><polygon class="st72" points="162.6,64.558 132,80.333 128.123,78.29 158.727,62.519 		"/><polygon class="st72" points="169.514,68.122 138.911,83.894 135.035,81.853 165.639,66.079 		"/><polygon class="st72" points="162.891,81.579 141.144,92.772 137.268,90.733 159.015,79.538 		"/><polygon class="st72" points="186.154,76.698 155.555,92.472 151.68,90.431 182.279,74.655 		"/><polygon class="st72" points="193.067,80.261 162.467,96.034 158.591,93.993 189.192,78.22 		"/><polygon class="st72" points="199.983,83.823 169.381,99.597 165.502,97.556 196.106,81.782 		"/><polygon class="st38" points="113.26,140.003 222.519,83.688 222.519,87.819 113.26,144.132 		"/><polygon class="st172" points="113.26,140.003 4,83.688 4,87.819 113.26,144.132 		"/></g>	<text class="st48 st66 st170 st150"  transform="matrix(1 0 0 1 339.1997 164.2637)" class="st48">rails</text>	<text class="st48 st160 st170 st150"  transform="matrix(1 0 0 1 43.8076 16.874)" class="st48">ruby</text>	<text transform="matrix(1 0 0 1 421.1855 163.2627)" class="st66 st116 st152">true</text>	<g>		<path class="st66" d="M400.511,164.708c-0.271,0-0.521-0.052-0.732-0.156c-0.22-0.104-0.43-0.244-0.627-0.419l-3.695-3.713			c-0.188-0.188-0.319-0.398-0.42-0.637c-0.092-0.238-0.139-0.479-0.139-0.729s0.047-0.479,0.139-0.715			c0.094-0.232,0.232-0.438,0.42-0.609c0.188-0.187,0.396-0.328,0.645-0.428c0.229-0.099,0.479-0.146,0.725-0.146			s0.482,0.055,0.715,0.146c0.233,0.1,0.441,0.241,0.627,0.428l2.354,2.354l5.938-5.963c0.188-0.188,0.396-0.325,0.628-0.418			c0.231-0.103,0.479-0.146,0.729-0.146s0.49,0.047,0.723,0.146c0.233,0.093,0.441,0.229,0.627,0.418			c0.188,0.187,0.324,0.396,0.41,0.628c0.088,0.229,0.131,0.474,0.131,0.724s-0.043,0.491-0.131,0.729			c-0.086,0.229-0.223,0.438-0.41,0.627l-7.305,7.305c-0.174,0.175-0.375,0.314-0.604,0.419			C401.026,164.657,400.779,164.708,400.511,164.708z"/></g>	<g>		<text class="st48 st160 st170 st150"  transform="matrix(1 0 0 1 339.1997 19.2734)" class="st48">sinatra</text>		<text transform="matrix(1 0 0 1 339.1997 68.2725)" class="st160 st170 st150">lotus</text>		<text class="st48 st160 st170 st150"  transform="matrix(1 0 0 1 339.1997 116.2656)" class="st48">ramaze</text>		<text transform="matrix(1 0 0 1 417.2002 20.2734)" class="st160 st170 st150">false</text>		<text transform="matrix(1 0 0 1 417.2002 69.2734)" class="st160 st170 st150">false</text>		<text transform="matrix(1 0 0 1 417.2002 117.2666)" class="st160 st170 st150">false</text>		<line class="st77" x1="394.974" y1="15.368" x2="405.974" y2="15.368"/><line class="st77" x1="394.974" y1="62.366" x2="405.974" y2="62.366"/><line class="st77" x1="394.974" y1="111.356" x2="405.974" y2="111.356"/></g>	<g>		<g>			<polyline class="st77" points="320.321,16.796 205.393,16.796 175.452,46.737 			"/><g>				<circle class="st160" cx="175.532" cy="46.656" r="2.256"/></g>		</g>	</g>	<g>		<g>			<polyline class="st77" points="318.319,60.097 228.765,60.097 220.325,68.536 			"/><g>				<circle class="st160" cx="220.405" cy="68.456" r="2.256"/></g>		</g>	</g>	<g>		<g>			<polyline class="st138" points="320.321,158.202 203.951,158.202 175.452,129.702 			"/><g>				<circle class="st134" cx="175.532" cy="129.782" r="2.256"/></g>		</g>	</g>	<g>		<g>			<polyline class="st77" points="317.318,115.341 227.764,115.341 220.325,107.903 			"/><g>				<circle class="st160" cx="220.405" cy="107.983" r="2.256"/></g>		</g>	</g>	<path class="st77" d="M320.321,166.819"/><use xlink:href="#Ruby"  width="64.608" height="64.607" x="-32.304" y="-32.304" transform="matrix(0.5889 0 0 -0.5889 52.0488 45.9834)" style="overflow:visible;"/></g><g id="mad-scientist">			<use xlink:href="#scientist"  width="182.982" height="141.654" x="-91.491" y="-70.827" transform="matrix(1 0 0 -1 95.4902 74.8267)" style="overflow:visible;"/><path class="st114" d="M191.914,89.938c-2.521,0-2.269-3.529,0-3.529c2.096,0,7.527,0,9.797,0s2.52,3.529,0,3.529		c-2.521,0-0.933,0-2.193,0v30.734c0,1.481-1.201,2.683-2.682,2.683c-1.483,0-2.686-1.201-2.686-2.683l0.027-30.734		C194.178,89.938,194.434,89.938,191.914,89.938z"/><path class="st114" d="M213.066,89.938c-2.52,0-2.27-3.529,0-3.529c2.096,0,7.529,0,9.799,0c2.268,0,2.52,3.529,0,3.529		c-2.521,0-0.934,0-2.195,0v30.734c0,1.481-1.199,2.683-2.682,2.683s-2.685-1.201-2.685-2.683l0.026-30.734		C215.33,89.938,215.588,89.938,213.066,89.938z"/><polyline class="st114" points="190.115,100.736 206.334,100.736 206.334,138.465 	"/><polyline class="st114" points="211.27,100.736 227.487,100.736 227.487,138.465 	"/><path class="st114" d="M234.221,89.938c-2.52,0-2.27-3.529,0-3.529c2.094,0,7.527,0,9.798,0c2.268,0,2.52,3.529,0,3.529		c-2.521,0-0.934,0-2.194,0v30.734c0,1.481-1.201,2.683-2.683,2.683c-1.482,0-2.685-1.201-2.685-2.683l0.026-30.734		C236.483,89.938,236.741,89.938,234.221,89.938z"/><polyline class="st114" points="232.424,100.736 248.641,100.736 248.641,138.465 	"/><line class="st114" x1="258.762" y1="138.465" x2="184.285" y2="138.465"/><line class="st114" x1="258.762" y1="143.242" x2="184.285" y2="143.242"/><line class="st118" x1="196.812" y1="112.414" x2="196.812" y2="121.35"/><line class="st63" x1="217.965" y1="112.414" x2="217.965" y2="121.35"/><line class="st139" x1="239.118" y1="112.414" x2="239.118" y2="121.35"/></g><g id="top-mini-stack">			<use xlink:href="#mini-stack_1_"  width="87.77" height="149.102" x="-43.885" y="-74.551" transform="matrix(1 0 0 -1 47.8848 78.5508)" style="overflow:visible;"/></g><g id="download">	<path class="st59" d="M15.49,9.641l-5.746,5.745L4,9.641h2.734V4h6.021v5.641H15.49z"/></g><g id="download-home">	<circle class="st156" cx="14.734" cy="14.735" r="10.735"/><path class="st59" d="M21.432,15.68l-6.695,6.69l-6.692-6.69h3.188V9.104h7.021v6.575H21.432z"/></g><g id="git">	<path class="st108" d="M29.955,13.802c-0.569-0.108-1.302-0.223-2.197-0.326c-0.896-0.108-2.048-0.148-3.458-0.122		c-0.096,0.163-0.143,0.312-0.143,0.448c0.229,0.014,0.56,0.024,0.98,0.051c0.43,0.02,0.905,0.061,1.438,0.122		c0.526,0.061,1.086,0.142,1.668,0.244c0.584,0.102,1.148,0.234,1.709,0.417l0.062,0.061c-0.041,0.055-0.089,0.081-0.145,0.081		c-0.543-0.162-1.107-0.295-1.697-0.396c-0.592-0.104-1.152-0.186-1.688-0.233c-0.534-0.055-1.019-0.092-1.442-0.112		c-0.429-0.02-0.748-0.024-0.968-0.024c-0.354,0.771-0.884,1.343-1.588,1.709c-0.705,0.36-1.586,0.645-2.646,0.834		c-0.139,0-0.264,0.01-0.377,0.024c-0.115,0.021-0.247,0.03-0.396,0.03c0.221,0.149,0.479,0.309,0.782,0.479		c0.306,0.17,0.604,0.363,0.886,0.6c0.284,0.229,0.524,0.506,0.728,0.824c0.194,0.313,0.295,0.689,0.295,1.129v2.479		c0,0.182,0.051,0.328,0.147,0.458c0.104,0.128,0.211,0.244,0.324,0.352c0.115,0.102,0.223,0.188,0.312,0.264		c0.098,0.075,0.139,0.14,0.123,0.193c0,0.055-0.045,0.092-0.135,0.106c-0.09,0.021-0.188,0.03-0.312,0.03s-0.251-0.007-0.388-0.021		c-0.14-0.019-0.263-0.026-0.365-0.039c-0.271-0.109-0.469-0.234-0.592-0.382c-0.121-0.144-0.209-0.276-0.269-0.417		c-0.054-0.146-0.072-0.312-0.062-0.483l-0.062-2.4c-0.217-0.271-0.427-0.516-0.631-0.729c-0.18-0.189-0.354-0.362-0.539-0.521		c-0.188-0.156-0.335-0.229-0.457-0.229v3.968c0,0.203,0.051,0.386,0.148,0.549c0.104,0.163,0.215,0.306,0.336,0.428		s0.231,0.23,0.336,0.325c0.105,0.095,0.152,0.176,0.152,0.244c0,0.146-0.08,0.224-0.232,0.224c-0.154,0-0.336-0.03-0.539-0.102		s-0.404-0.156-0.607-0.268c-0.202-0.106-0.354-0.2-0.446-0.282c-0.241-0.244-0.386-0.604-0.416-1.078		c-0.032-0.479-0.028-0.938,0.013-1.383c0-0.224-0.004-0.479-0.013-0.783c-0.011-0.312-0.021-0.604-0.028-0.886		c-0.017-0.344-0.027-0.684-0.041-1.021L16.375,18.3c0.017,0.742,0.017,1.438,0,2.096c-0.017,0.556-0.033,1.092-0.062,1.604		c-0.027,0.52-0.074,0.86-0.146,1.036c-0.106,0.23-0.271,0.421-0.487,0.57c-0.218,0.148-0.438,0.261-0.66,0.335		c-0.225,0.074-0.416,0.108-0.58,0.104c-0.162-0.012-0.242-0.064-0.242-0.179c0-0.062,0.037-0.125,0.111-0.173		c0.072-0.048,0.162-0.104,0.264-0.173c0.104-0.067,0.197-0.148,0.285-0.244c0.088-0.095,0.15-0.224,0.191-0.387		c0.025-0.149,0.049-0.468,0.062-0.956c0.013-0.488,0.021-1.004,0.021-1.546c0-0.639-0.009-1.336-0.021-2.096		c-0.271,0.081-0.512,0.177-0.713,0.279c-0.179,0.101-0.336,0.218-0.479,0.356c-0.146,0.14-0.215,0.308-0.215,0.498v2.95		c0,0.188-0.062,0.356-0.175,0.519c-0.114,0.155-0.26,0.284-0.429,0.387c-0.17,0.104-0.353,0.186-0.539,0.233		c-0.188,0.055-0.354,0.082-0.487,0.082c-0.104,0-0.229-0.008-0.364-0.021c-0.138-0.015-0.201-0.056-0.201-0.118		c0-0.101,0.051-0.186,0.149-0.26c0.104-0.068,0.213-0.153,0.334-0.254c0.123-0.095,0.232-0.203,0.336-0.322		s0.151-0.271,0.151-0.445v-2.259c-0.097,0.015-0.202,0.022-0.323,0.041c-0.104,0.014-0.231,0.021-0.377,0.025		c-0.145,0.007-0.304,0.013-0.479,0.013c-0.446,0-0.791-0.062-1.026-0.19s-0.42-0.288-0.552-0.479		c-0.129-0.188-0.225-0.383-0.282-0.576c-0.062-0.194-0.125-0.367-0.192-0.521c-0.177-0.434-0.368-0.767-0.58-0.997		c-0.209-0.229-0.438-0.413-0.683-0.549c-0.146-0.108-0.235-0.214-0.265-0.315c-0.025-0.101,0.031-0.166,0.186-0.188		c0.405-0.067,0.746-0.012,1.021,0.173c0.271,0.183,0.514,0.403,0.723,0.661c0.211,0.258,0.414,0.516,0.608,0.771		c0.196,0.262,0.425,0.433,0.685,0.513c0.396,0.104,0.709,0.151,0.945,0.144c0.234-0.013,0.471-0.106,0.699-0.284		c0.016-0.163,0.125-0.314,0.336-0.469c0.209-0.148,0.444-0.291,0.711-0.427c0.268-0.142,0.521-0.267,0.766-0.376		c0.242-0.115,0.414-0.207,0.51-0.275h-0.081c-1.312-0.105-2.365-0.386-3.152-0.834c-0.787-0.447-1.377-1.037-1.771-1.771		C9.2,14.021,8.569,14.051,8.01,14.099c-0.557,0.047-1.06,0.104-1.506,0.173c-0.447,0.066-0.843,0.139-1.183,0.213		c-0.341,0.075-0.647,0.146-0.938,0.214c-0.041,0.041-0.093,0.064-0.148,0.071c-0.062,0.007-0.104,0.01-0.137,0.01		c-0.015,0.017-0.022,0.017-0.039,0c-0.023,0-0.041-0.022-0.041-0.081c-0.015,0-0.015-0.007,0-0.021c0-0.026,0.026-0.04,0.08-0.04		c0.026,0,0.062-0.017,0.104-0.031c0.04-0.021,0.071-0.03,0.104-0.03c0.599-0.146,1.319-0.309,2.179-0.478		c0.854-0.17,1.967-0.271,3.336-0.295c-0.039-0.082-0.077-0.16-0.11-0.234s-0.07-0.146-0.111-0.214c-0.259,0-0.639,0.011-1.142,0.03		c-0.5,0.021-1.026,0.048-1.575,0.082c-0.55,0.028-1.077,0.076-1.586,0.132c-0.511,0.055-0.905,0.122-1.19,0.204		c-0.054,0-0.08-0.02-0.08-0.041c-0.015-0.02-0.015-0.034,0-0.062c-0.023-0.021-0.033-0.047-0.021-0.061		c0.014-0.02,0.021-0.034,0.021-0.062c0.284-0.062,0.68-0.128,1.182-0.183c0.502-0.054,1.025-0.104,1.574-0.133		c0.551-0.033,1.074-0.062,1.576-0.081c0.502-0.021,0.896-0.03,1.182-0.03c-0.146-0.354-0.242-0.749-0.283-1.188		s-0.062-0.895-0.062-1.354c0-0.42,0.03-0.783,0.093-1.089c0.063-0.306,0.146-0.579,0.243-0.823s0.228-0.472,0.366-0.682		c0.138-0.21,0.302-0.437,0.479-0.661c-0.123-0.488-0.182-0.938-0.174-1.343c0.006-0.407,0.044-0.766,0.11-1.062		c0.066-0.353,0.164-0.658,0.284-0.916c0.229-0.014,0.511,0.021,0.834,0.104c0.271,0.062,0.61,0.188,1.023,0.377		c0.414,0.183,0.896,0.471,1.455,0.858c0.3-0.116,0.698-0.217,1.2-0.279c0.501-0.067,1.028-0.108,1.586-0.122		c0.559-0.019,1.104,0.004,1.646,0.052c0.543,0.047,0.998,0.118,1.363,0.213c0.217-0.135,0.479-0.284,0.793-0.447		c0.312-0.159,0.619-0.309,0.926-0.438s0.596-0.229,0.863-0.295c0.271-0.067,0.488-0.074,0.65-0.021		c0.055,0.081,0.108,0.193,0.174,0.336c0.062,0.146,0.111,0.336,0.147,0.58c0.041,0.244,0.062,0.542,0.062,0.896		c0,0.354-0.033,0.767-0.104,1.239c0.055,0.104,0.153,0.245,0.307,0.418c0.146,0.171,0.306,0.396,0.469,0.683		s0.312,0.641,0.438,1.067c0.129,0.428,0.19,0.94,0.19,1.557c-0.024,0.476-0.062,0.905-0.104,1.292s-0.098,0.735-0.162,1.048		c1.396,0,2.533,0.044,3.418,0.132c0.881,0.089,1.619,0.188,2.219,0.295l0.039,0.041c0.027,0.027,0.041,0.061,0.041,0.081		c-0.041,0-0.065,0.021-0.08,0.053C30.003,13.785,29.982,13.802,29.955,13.802z"/></g><g id="irc">	<polygon class="st112" points="24.195,4 4,4 4,18.416 14.916,18.416 20.83,24.33 20.83,18.416 24.195,18.416 	"/></g><g id="git-big">	<path class="st112" d="M44.566,19.298c-0.89-0.169-2.03-0.339-3.434-0.509c-1.398-0.169-3.2-0.232-5.405-0.191		c-0.146,0.259-0.223,0.488-0.223,0.7c0.36,0.021,0.875,0.047,1.543,0.08c0.667,0.032,1.414,0.095,2.24,0.19		c0.827,0.096,1.694,0.223,2.604,0.382c0.911,0.159,1.804,0.376,2.671,0.651l0.098,0.096c-0.062,0.085-0.141,0.127-0.226,0.127		c-0.848-0.254-1.729-0.461-2.653-0.62c-0.923-0.159-1.803-0.28-2.64-0.365c-0.838-0.084-1.59-0.143-2.258-0.175		c-0.667-0.032-1.171-0.048-1.511-0.048c-0.553,1.208-1.379,2.099-2.479,2.671s-2.479,1.007-4.133,1.303		c-0.212,0-0.408,0.02-0.588,0.051c-0.181,0.028-0.388,0.048-0.619,0.048c0.338,0.229,0.746,0.479,1.226,0.747		c0.479,0.266,0.938,0.574,1.385,0.938c0.443,0.36,0.82,0.79,1.128,1.287c0.308,0.499,0.461,1.086,0.461,1.765v3.882		c0,0.272,0.08,0.515,0.239,0.716c0.155,0.2,0.324,0.381,0.509,0.541c0.18,0.159,0.344,0.296,0.491,0.413		c0.146,0.112,0.213,0.217,0.188,0.302c0,0.084-0.069,0.143-0.207,0.175c-0.139,0.032-0.302,0.047-0.492,0.047		c-0.188,0-0.393-0.011-0.604-0.031c-0.212-0.021-0.403-0.043-0.572-0.062c-0.425-0.17-0.729-0.366-0.922-0.589		c-0.19-0.223-0.329-0.439-0.413-0.651c-0.086-0.229-0.117-0.485-0.1-0.763l-0.096-3.751c-0.339-0.424-0.668-0.808-0.982-1.146		c-0.275-0.297-0.559-0.563-0.846-0.811c-0.283-0.244-0.521-0.366-0.715-0.366v6.2c0,0.318,0.079,0.604,0.238,0.858		c0.158,0.254,0.334,0.477,0.522,0.666c0.188,0.188,0.364,0.357,0.522,0.51c0.158,0.146,0.236,0.271,0.236,0.381		c0,0.229-0.121,0.35-0.363,0.35c-0.244,0-0.522-0.053-0.844-0.158c-0.316-0.104-0.639-0.241-0.955-0.412		c-0.315-0.173-0.553-0.316-0.697-0.444c-0.383-0.381-0.602-0.943-0.649-1.688c-0.056-0.739-0.05-1.463,0.019-2.159		c0-0.342-0.006-0.746-0.019-1.227c-0.013-0.478-0.024-0.938-0.05-1.383c-0.021-0.53-0.043-1.061-0.062-1.589l-1.778,0.095		c0.021,1.166,0.021,2.258,0,3.275c-0.021,0.867-0.054,1.706-0.097,2.511s-0.116,1.346-0.226,1.622		c-0.17,0.359-0.424,0.657-0.763,0.89c-0.34,0.233-0.687,0.408-1.033,0.525c-0.35,0.116-0.648,0.169-0.904,0.159		c-0.254-0.015-0.384-0.104-0.384-0.271c0-0.104,0.062-0.193,0.179-0.271c0.112-0.074,0.254-0.164,0.412-0.271		c0.157-0.104,0.309-0.229,0.442-0.381c0.142-0.146,0.237-0.35,0.306-0.604c0.041-0.232,0.071-0.73,0.096-1.493		c0.021-0.767,0.031-1.569,0.031-2.416c0-0.997-0.014-2.089-0.031-3.275c-0.426,0.127-0.795,0.276-1.113,0.445		c-0.274,0.146-0.522,0.334-0.746,0.557c-0.225,0.226-0.334,0.481-0.334,0.779v4.609c0,0.298-0.092,0.564-0.271,0.812		c-0.184,0.244-0.402,0.445-0.668,0.604c-0.268,0.156-0.545,0.277-0.845,0.362c-0.298,0.085-0.552,0.127-0.765,0.127		c-0.17,0-0.359-0.011-0.571-0.029c-0.211-0.021-0.314-0.086-0.314-0.189c0-0.148,0.079-0.281,0.237-0.396		c0.157-0.116,0.334-0.25,0.521-0.396c0.188-0.147,0.365-0.318,0.522-0.509c0.158-0.191,0.238-0.425,0.238-0.7v-3.529		c-0.146,0.021-0.318,0.042-0.509,0.063c-0.17,0.021-0.366,0.036-0.59,0.048c-0.223,0.01-0.473,0.016-0.746,0.016		c-0.699,0-1.234-0.101-1.604-0.302c-0.371-0.202-0.658-0.451-0.856-0.747c-0.201-0.297-0.353-0.599-0.445-0.906		c-0.095-0.307-0.194-0.574-0.302-0.811c-0.274-0.68-0.577-1.197-0.905-1.56c-0.33-0.358-0.687-0.646-1.062-0.856		c-0.232-0.169-0.371-0.334-0.412-0.493c-0.043-0.159,0.053-0.26,0.282-0.302c0.64-0.106,1.166-0.02,1.593,0.27		c0.424,0.286,0.801,0.634,1.129,1.033c0.325,0.403,0.646,0.809,0.951,1.208c0.31,0.403,0.662,0.667,1.064,0.794		c0.612,0.17,1.104,0.244,1.479,0.226c0.368-0.021,0.733-0.169,1.097-0.444c0.021-0.254,0.194-0.498,0.523-0.729		c0.327-0.231,0.698-0.455,1.111-0.669c0.413-0.213,0.812-0.406,1.189-0.589c0.382-0.18,0.646-0.32,0.795-0.43h-0.127		c-2.057-0.169-3.698-0.604-4.928-1.303c-1.229-0.7-2.152-1.622-2.768-2.77c-1.104,0.021-2.088,0.069-2.957,0.146		c-0.869,0.073-1.653,0.164-2.354,0.27c-0.698,0.106-1.312,0.22-1.845,0.334c-0.53,0.117-1.021,0.229-1.463,0.334		c-0.062,0.063-0.146,0.104-0.237,0.111c-0.093,0.007-0.164,0.016-0.207,0.016c-0.021,0.021-0.043,0.021-0.062,0		c-0.043,0-0.062-0.042-0.062-0.127c-0.021,0-0.021-0.011,0-0.03c0-0.041,0.043-0.062,0.127-0.062c0.043,0,0.096-0.017,0.159-0.047		c0.062-0.032,0.114-0.048,0.157-0.048c0.934-0.233,2.064-0.482,3.4-0.747c1.334-0.268,3.071-0.418,5.217-0.461		c-0.063-0.128-0.123-0.249-0.178-0.366c-0.054-0.116-0.109-0.229-0.177-0.334c-0.399,0-0.996,0.016-1.778,0.048		c-0.783,0.032-1.604,0.074-2.466,0.127c-0.854,0.056-1.686,0.123-2.479,0.207c-0.795,0.085-1.414,0.189-1.859,0.317		c-0.084,0-0.127-0.021-0.127-0.063c-0.021-0.021-0.021-0.052,0-0.095c-0.043-0.042-0.053-0.074-0.03-0.097		c0.021-0.021,0.03-0.056,0.03-0.099c0.445-0.104,1.062-0.199,1.845-0.285c0.784-0.084,1.604-0.15,2.465-0.205		c0.856-0.055,1.683-0.098,2.466-0.127c0.784-0.03,1.396-0.049,1.845-0.049c-0.231-0.551-0.382-1.171-0.445-1.857		c-0.062-0.688-0.095-1.396-0.095-2.113c0-0.656,0.048-1.225,0.145-1.701c0.098-0.478,0.225-0.904,0.383-1.288		c0.158-0.382,0.351-0.733,0.57-1.062c0.225-0.328,0.475-0.672,0.748-1.032c-0.189-0.764-0.279-1.462-0.271-2.099		c0.011-0.639,0.068-1.188,0.175-1.652c0.104-0.552,0.254-1.028,0.445-1.432c0.357-0.021,0.795,0.03,1.303,0.158		c0.427,0.104,0.959,0.303,1.606,0.589c0.646,0.283,1.399,0.734,2.271,1.351c0.468-0.188,1.093-0.339,1.877-0.444		c0.783-0.104,1.608-0.169,2.479-0.188c0.866-0.021,1.728,0.006,2.573,0.08c0.849,0.075,1.56,0.187,2.129,0.333		c0.341-0.211,0.754-0.445,1.24-0.699s0.971-0.479,1.445-0.684c0.479-0.201,0.928-0.354,1.354-0.462		c0.425-0.104,0.765-0.115,1.02-0.031c0.084,0.127,0.174,0.302,0.271,0.522c0.098,0.225,0.178,0.523,0.237,0.906		c0.063,0.381,0.097,0.85,0.097,1.398c0,0.552-0.054,1.195-0.156,1.938c0.084,0.17,0.24,0.389,0.478,0.65		c0.231,0.267,0.479,0.62,0.729,1.062c0.256,0.445,0.479,1.001,0.685,1.669c0.201,0.669,0.305,1.479,0.305,2.436		c-0.043,0.742-0.098,1.415-0.157,2.02c-0.063,0.604-0.147,1.149-0.257,1.641c2.186,0,3.966,0.065,5.344,0.206		c1.377,0.139,2.531,0.292,3.465,0.461l0.062,0.062c0.043,0.042,0.062,0.085,0.062,0.127c-0.062,0-0.104,0.025-0.128,0.079		C44.64,19.273,44.609,19.298,44.566,19.298z"/></g><g id="irc-big">	<polygon class="st112" points="35.561,4 4,4 4,26.529 21.059,26.529 30.3,35.771 30.3,26.529 35.561,26.529 	"/></g><g id="trello">	<path class="st112" d="M18.23,22.263c-0.321,0-0.616-0.062-0.883-0.188s-0.519-0.294-0.756-0.504l-4.451-4.477		c-0.226-0.224-0.394-0.479-0.504-0.767c-0.113-0.286-0.169-0.577-0.169-0.871s0.056-0.581,0.169-0.861		c0.111-0.276,0.279-0.521,0.504-0.73c0.223-0.228,0.479-0.396,0.767-0.519c0.287-0.118,0.577-0.178,0.871-0.178		c0.295,0,0.582,0.06,0.86,0.178c0.28,0.12,0.532,0.291,0.757,0.519l2.836,2.835L30.242,4.671c0.223-0.223,0.475-0.391,0.756-0.503		C31.277,4.056,31.568,4,31.869,4s0.592,0.056,0.871,0.168c0.28,0.112,0.532,0.28,0.756,0.503c0.229,0.225,0.392,0.477,0.494,0.757		s0.157,0.57,0.157,0.871s-0.055,0.592-0.157,0.872s-0.271,0.532-0.494,0.756L19.852,21.573c-0.211,0.21-0.452,0.378-0.729,0.504		C18.85,22.201,18.552,22.263,18.23,22.263z"/><polygon class="st112" points="29.559,29.888 4,29.888 4,4.33 25.987,4.33 23.011,7.33 7,7.33 7,26.888 26.559,26.888 		26.559,19.222 29.559,15.866 	"/></g><g id="mac">	<polygon class="st145" points="4,37.091 61.314,4 118.63,37.091 118.63,103.273 61.314,136.363 4,103.273 	"/><g  class="logo" >		<path class="st93" d="M64.521,47.814c3.127-4.12,7.475-4.141,7.475-4.141s0.646,3.875-2.459,7.608			c-3.316,3.982-7.084,3.33-7.084,3.33S61.743,51.478,64.521,47.814z"/><path class="st93" d="M62.846,57.326c1.611,0,4.594-2.21,8.479-2.21c6.69,0,9.315,4.757,9.315,4.757s-5.144,2.631-5.144,9.013			c0,7.202,6.408,9.685,6.408,9.685s-4.479,12.61-10.529,12.61c-2.781,0-4.943-1.873-7.873-1.873c-2.981,0-5.943,1.943-7.873,1.943			c-5.531,0-12.512-11.962-12.512-21.58c0-9.459,5.909-14.424,11.455-14.424C58.18,55.247,60.975,57.326,62.846,57.326z"/></g></g><g id="win">	<polygon class="st145" points="4,36.966 61.102,4 118.199,36.966 118.199,102.899 61.102,135.865 4,102.899 	"/><g  class="logo " >		<polygon class="st93" points="81.667,68.789 81.667,46.007 55.498,49.824 55.498,68.789 		"/><polygon class="st93" points="53.652,50.093 34.648,52.866 34.648,68.789 53.652,68.789 		"/><polygon class="st93" points="34.648,70.635 34.648,86.759 53.652,89.565 53.652,70.635 		"/><polygon class="st93" points="55.498,89.837 81.667,93.697 81.667,70.635 55.498,70.635 		"/></g></g><g id="lnx">	<polygon class="st145" points="4,36.966 61.102,4 118.2,36.966 118.2,102.899 61.102,135.865 4,102.899 	"/><g  class="logo " >		<path class="st93" d="M54.739,85.053c1.899-0.197,2.153-2.212,1.256-3.093c-0.739-0.724-4.812-3.748-5.876-4.939			c-0.494-0.552-1.165-0.822-1.445-1.442c-0.653-1.426-1.108-3.465-0.282-4.928c0.147-0.264,0.243-0.146,0.132,0.405			c-0.648,3.121,1.382,5.67,1.828,4.363c0.309-0.903,0.021-2.52,0.188-3.802c0.296-2.271,2.364-6.633,3.271-6.881			c-1.401-2.594,1.64-4.624,1.604-6.903c-0.025-1.478,1.3,1.821,2.628,2.523c1.491,0.78,3.123-1.473,5.443-2.616			c0.655-0.325,1.499-0.698,1.439-0.973c-0.27-1.332-3.045,1.643-5.523,1.741c-1.132,0.047-1.548-0.222-1.989-0.643			c-1.317-1.275,0.136-0.212,2.102-0.566c0.871-0.159,1.167-0.304,2.091-0.677c0.925-0.375,1.986-0.93,3.033-1.214			c0.729-0.197,0.667-0.747,0.386-0.912c-0.163-0.095-0.408-0.085-0.601,0.245c-0.446,0.778-2.561,1.227-3.222,1.431			c-0.847,0.256-1.787,0.5-3.034,0.449c-1.89-0.079-1.448-0.943-2.8-1.718c-0.396-0.229-0.291-0.825,0.235-1.354			c0.279-0.275,1.035-0.431,1.411-1.062c0.053-0.086,0.537-0.593,0.916-0.855c0.131-0.089,0.145-2.399-1.044-2.447			c-1.004-0.04-1.289,0.74-1.252,1.517c0.043,0.777,0.455,1.42,0.729,1.414c0.527-0.003,0.035,0.581-0.258,0.675			c-0.436,0.142-1.042-1.73-0.97-2.632c0.071-0.936,0.561-2.597,1.743-2.564c1.067,0.03,1.846,1.368,1.805,3.679			c-0.008,0.392,1.73-0.188,2.312,0.426c0.415,0.439-1.42-4.094,2.671-4.406c1.073,0.208,2.11,0.565,2.54,3.043			c-0.16,0.257,0.27,1.986-0.394,2.191c-0.816,0.248-1.318-0.036-0.847-0.81c0.322-0.776,0.008-2.751-1.636-2.632			c-1.642,0.118-1.426,3.034-0.975,3.09c0.45,0.057,1.584,0.864,2.376,1.016c2.602,0.506,0.691,1.996,1.025,3.799			c0.381,2.039,1.725,1.498,2.928,6.892c0.254,0.329,1.252,0.641,2.224,4.783c0.878,3.729-0.365,6.438,1.741,6.216			c0.476-0.05,1.166-0.183,1.47-1.239c0.787-2.76-0.396-6.05-1.589-8.271c-0.693-1.294-1.348-2.177-1.696-2.478			c1.368,0.807,3.114,3.39,3.521,5.307c0.529,2.517,0.906,3.584,0.104,6.246c0.462,0.233,1.62,0.721,1.62,1.271			c-1.204-0.986-4.876-1.162-4.969,1.197c-0.632,0.012-1.103,0.064-1.504,0.542c-1.479,1.754-0.107,5.271-0.259,7.159			c-0.133,1.658-0.592,3.305-0.852,4.973c-0.88-0.033-0.792-0.677-0.511-1.58c0.248-0.796,0.649-1.793,0.678-2.75			c0.023-0.864-0.072-1.407-0.289-1.541c-0.221-0.136-0.562,0.137-1.03,0.898c-1.012,1.625-3.195,2.337-5.236,2.592			c-2.039,0.257-3.935,0.054-4.938-1.07c-0.347-0.385-0.913,0.103-0.98,0.208c-0.09,0.135,0.33,0.401,0.649,0.985			c0.466,0.854,0.91,2.151-0.195,2.741C56.663,87.066,55.711,86.89,54.739,85.053L54.739,85.053z M54.006,84.973			c0.734,1.15,3.311,5.993-1.207,6.624c-1.509,0.209-3.938-0.878-6.291-1.454c-2.119-0.521-4.271-0.826-5.472-1.164			c-0.722-0.202-1.028-0.463-1.091-0.766c-0.165-0.803,0.884-1.931,0.934-2.883c0.053-0.954-0.352-1.448-0.676-2.224			c-0.328-0.78-0.412-1.36-0.152-1.696c0.205-0.26,0.621-0.367,1.3-0.302c0.854,0.084,1.886-0.09,2.446-0.429			c0.934-0.572,1.373-1.742,0.95-3.152c0,1.382-0.448,1.901-1.586,2.533c-1.065,0.596-2.715,0.115-3.476,0.771			c-0.912,0.792,0.324,2.835,0.224,4.335c-0.075,1.154-1.282,2.455-0.746,3.609c0.542,1.163,3.058,1.288,5.684,1.837			c3.726,0.78,5.903,2.14,7.629,2.203c2.513,0.093,2.896-2.487,6.846-2.521c1.152-0.062,2.277-0.098,3.402-0.113			c1.278-0.014,2.546-0.003,3.855,0.026c2.627,0.065,1.722,1.436,3.427,2.311c1.437,0.739,4.023,0.448,4.645-0.142			c0.836-0.798,3.083-2.719,4.809-3.585c2.146-1.083,7.185-2.945,3.522-5.213c-0.853-0.53-2.868-1.091-3.039-4.962			c-0.761,0.682-0.67,4.288,1.457,5.004c2.378,0.799,3.866,2.135-0.557,3.648c-2.929,1.001-3.429,1.31-5.746,3.239			c-2.347,1.953-5.827,1.178-5.22-2.933c0.318-2.142,0.5-3.912-0.032-5.775c-0.261-0.909-0.392-2.077-0.213-2.894			c0.349-1.591,1.208-2.07,2.049-0.544c0.531,0.958,0.718,2.081,2.614,2.172c2.98,0.143,3.568-2.881,4.522-3.018			c0.634-0.093,1.273-1.891,0.787-4.8c-0.517-3.115-2.353-8.031-4.7-10.524c-1.955-2.074-3.184-3.89-3.959-6.484			c-0.649-2.179-1.014-4.3-0.881-6.326c0.178-2.63-1.28-6.286-3.6-8.006c-1.453-1.077-3.729-1.653-5.792-1.63			c-1.155,0.014-2.243,0.182-3.081,0.633c-3.438,1.867-3.918,4.535-3.869,7.582c0.049,2.856,0.149,6.124,0.473,9.228			c-0.384,1.426-2.385,4.126-3.673,5.77c-1.722,1.706-2.591,4.996-3.706,7.871c-0.594,1.534-1.599,2.226-1.683,4.196			c-0.024,0.551-0.007,1.979,0.521,1.57C47.674,75.041,50.195,78.972,54.006,84.973L54.006,84.973z M64.475,43.749			c-0.105,0.324-0.555,0.596-0.271,0.822c0.287,0.23,0.448-0.315,1.022-0.521c0.143-0.051,0.83,0.023,0.959-0.306			c0.053-0.139-0.354-0.302-0.602-0.536c-0.241-0.233-0.479-0.44-0.71-0.427C64.282,42.82,64.57,43.461,64.475,43.749L64.475,43.749			z M67.98,55.609c0.214-0.225,0.32,0.385,0.896,0.747c0.453,0.285,0.896,0.072,1.01,0.655c0.078,0.416-0.18,0.867-0.527,0.809			C68.752,57.715,67.35,56.269,67.98,55.609L67.98,55.609z M58.522,51.949c-0.943-0.07-1.007,0.609-0.694,0.601			C58.142,52.537,57.948,52.01,58.522,51.949L58.522,51.949z M56.902,50.207c0.112-0.024,0.271,0.165,0.221,0.433			c-0.064,0.369-0.035,0.599,0.221,0.602c0.039,0,0.088-0.01,0.101-0.104c0.122-0.736-0.26-1.279-0.412-1.316			C56.668,49.728,56.715,50.248,56.902,50.207L56.902,50.207z M63.77,49.895c0.238,0.07,0.469,0.485,0.519,0.934			c0.007,0.041,0.316-0.065,0.318-0.162c0.021-0.721-0.599-1.06-0.759-1.045C63.479,49.655,63.583,49.841,63.77,49.895L63.77,49.895			z M60.25,52.035c0.856-0.396,1.157,0.22,0.861,0.318C60.811,52.456,60.805,51.893,60.25,52.035L60.25,52.035z M49.889,66.649			c-0.404-0.048,0.119-0.353,0.343-0.736c0.243-0.423,0.194-0.947,0.45-0.87c0.261,0.076,0.117,0.372-0.062,0.854			C50.473,66.31,50.044,66.667,49.889,66.649L49.889,66.649z"/></g></g><g id="download-breakdown">	<rect x="4" y="4" class="st45" width="244.105" height="245.264"/><g  class="ubuntu" >		<rect x="10.202" y="10.081" class="st127" width="213.711" height="233.102"/><g>			<g>				<polyline class="st184" points="404.564,10.08 304.962,10.08 207.549,107.492 				"/><g>					<circle class="st128" cx="207.629" cy="107.413" r="2.256"/></g>			</g>		</g>	</g>	<g  class="nanobox" >		<rect x="226.579" y="199.66" class="st128" width="15.989" height="4.76"/><g>			<g>				<polyline class="st184" points="404.564,131.36 304.962,131.36 234.755,201.567 				"/><g>					<circle class="st128" cx="234.835" cy="201.487" r="2.256"/></g>			</g>		</g>	</g>	<g  class="vagrant" >		<rect x="226.579" y="207.562" class="st6" width="15.655" height="16.648"/><g>			<g>				<polyline class="st184" points="404.564,238.401 256.532,238.401 234.755,216.625 				"/><g>					<circle class="st128" cx="234.835" cy="216.705" r="2.256"/></g>			</g>		</g>	</g>	<g  class="virtual-box" >		<rect x="226.579" y="227.203" class="st127" width="15.655" height="15.979"/><g>			<g>				<polyline class="st184" points="404.564,328.81 326.29,328.81 234.755,237.276 				"/><g>					<circle class="st128" cx="234.835" cy="237.355" r="2.256"/></g>			</g>		</g>	</g></g><g id="checkbox">	<rect x="4" y="4" class="st148" width="15.739" height="15.741"/><g  class="check" >		<path class="st72" d="M13.047,15.505c-0.252,0-0.483-0.05-0.692-0.148c-0.211-0.1-0.408-0.232-0.597-0.397L8.25,11.437			c-0.177-0.177-0.31-0.378-0.396-0.604c-0.088-0.227-0.134-0.455-0.134-0.688c0-0.232,0.045-0.458,0.134-0.679			C7.941,9.245,8.074,9.053,8.25,8.887c0.176-0.176,0.377-0.312,0.604-0.405C9.08,8.389,9.309,8.341,9.541,8.341			c0.233,0,0.457,0.047,0.68,0.141c0.221,0.094,0.42,0.229,0.596,0.405l2.23,2.233l5.645-5.657c0.176-0.177,0.373-0.309,0.594-0.397			c0.221-0.088,0.449-0.132,0.688-0.132c0.235,0,0.468,0.044,0.688,0.132c0.222,0.089,0.418,0.221,0.595,0.397			c0.179,0.177,0.308,0.375,0.39,0.596c0.084,0.221,0.125,0.449,0.125,0.687c0,0.238-0.041,0.466-0.125,0.687			c-0.082,0.221-0.211,0.419-0.39,0.595l-6.931,6.932c-0.166,0.165-0.354,0.298-0.571,0.397			C13.536,15.455,13.302,15.505,13.047,15.505z"/></g></g><g id="download-big">	<path class="st145" d="M7.779,11.789V4h8.311v7.789h3.777l-7.932,7.932L4,11.789H7.779z"/></g><g id="mad-scientist-window">	<circle class="st169" cx="124.68" cy="118.851" r="114.851"/><g>		<g>			<g>				<defs>					<circle id="SVGID_93_" cx="124.68" cy="118.851" r="114.851"/></defs>				<clipPath id="SVGID_94_">					<use xlink:href="#SVGID_93_"  style="overflow:visible;"/></clipPath>				<g transform="matrix(1 0 0 1 -2.441406e-04 -6.103516e-05)" class="st166">											<use xlink:href="#scientist"  width="182.982" height="141.654" x="-91.491" y="-70.827" transform="matrix(1.2133 0 0 -1.2133 115.0051 120.042)" style="overflow:visible;"/></g>			</g>		</g>	</g></g><g id="right-arrow">	<polygon class="st112" points="10.711,8.062 4,12.126 4,4 	"/></g><g id="irc-outline">	<polygon class="st118" points="35.553,4 4,4 4,27.495 20.43,27.495 30.065,37.132 30.065,27.495 35.553,27.495 	"/></g><g id="plugin-scripts">	<text transform="matrix(1 0 0 1 4 74.3076)" class="st66 st170 st151">sniff </text>	<text class=" st66 st170 st151"  transform="matrix(1 0 0 1 78.0811 74.3076)">boxfile</text>	<text transform="matrix(1 0 0 1 154.6133 74.3076)" class="st66 st170 st151">prepare</text>	<text transform="matrix(1 0 0 1 245.585 74.3076)" class="st66 st170 st151">build</text>	<text transform="matrix(1 0 0 1 326.478 74.3076)" class="st66 st170 st151">cleanup</text>	<rect x="5.204" y="4" class="st42" width="31.397" height="42.717"/><line class="st39" x1="11.902" y1="13.857" x2="29.276" y2="13.857"/><line class="st39" x1="11.902" y1="18.658" x2="25.902" y2="18.658"/><line class="st39" x1="11.902" y1="28.26" x2="25.902" y2="28.26"/><line class="st39" x1="11.902" y1="23.459" x2="29.276" y2="23.459"/><rect x="85.944" y="4" class="st42" width="31.397" height="42.717"/><line class="st39" x1="92.643" y1="13.857" x2="110.017" y2="13.857"/><line class="st39" x1="92.643" y1="18.658" x2="106.643" y2="18.658"/><line class="st39" x1="92.643" y1="28.26" x2="106.643" y2="28.26"/><line class="st39" x1="92.643" y1="23.459" x2="110.017" y2="23.459"/><rect x="166.685" y="4" class="st42" width="31.397" height="42.717"/><line class="st39" x1="173.383" y1="13.857" x2="190.757" y2="13.857"/><line class="st39" x1="173.383" y1="18.658" x2="187.383" y2="18.658"/><line class="st39" x1="173.383" y1="28.26" x2="187.383" y2="28.26"/><line class="st39" x1="173.383" y1="23.459" x2="190.757" y2="23.459"/><rect x="247.425" y="4" class="st42" width="31.397" height="42.717"/><line class="st39" x1="254.123" y1="13.857" x2="271.497" y2="13.857"/><line class="st39" x1="254.123" y1="18.658" x2="268.123" y2="18.658"/><line class="st39" x1="254.123" y1="28.26" x2="268.123" y2="28.26"/><line class="st39" x1="254.123" y1="23.459" x2="271.497" y2="23.459"/><rect x="338.173" y="4" class="st42" width="31.397" height="42.717"/><line class="st39" x1="344.871" y1="13.857" x2="362.245" y2="13.857"/><line class="st39" x1="344.871" y1="18.658" x2="358.871" y2="18.658"/><line class="st39" x1="344.871" y1="28.26" x2="358.871" y2="28.26"/><line class="st39" x1="344.871" y1="23.459" x2="362.245" y2="23.459"/></g><g id="search">	<path class="st171" d="M14.689,4c-3.086,0-5.599,2.511-5.599,5.597c0,1.022,0.28,1.979,0.761,2.806L4,18.252l1.938,1.942		l5.829-5.829c0.853,0.524,1.852,0.833,2.923,0.833c3.087,0,5.6-2.514,5.6-5.602C20.289,6.511,17.776,4,14.689,4z M14.689,12.458		c-1.574,0-2.859-1.283-2.859-2.861c0-1.574,1.285-2.856,2.859-2.856c1.578,0,2.86,1.282,2.86,2.856		C17.55,11.175,16.268,12.458,14.689,12.458z"/></g>';
var ShadowIcons, pxicons;

ShadowIcons = (function() {
  function ShadowIcons() {
    window.shadowIconsInstance = this;
  }

  ShadowIcons.prototype.svgReplaceWithString = function(svgString, $jqueryContext) {
    return this.replacePlaceholdersWithSVGs(svgString, $jqueryContext);
  };

  ShadowIcons.prototype.svgReplaceWithExternalFile = function(url, $jqueryContext) {
    return $.ajax({
      url: url,
      type: "GET",
      dataType: "xml",
      success: (function(_this) {
        return function(svgData, status, jqXHR) {
          return _this.replacePlaceholdersWithSVGs(svgData, $jqueryContext);
        };
      })(this)
    });
  };

  ShadowIcons.prototype.replacePlaceholdersWithSVGs = function(svg, $jqueryContext) {
    var $holder, $svg, $targetSvg, box, id, image, images, newNode, rawHtml, scalable, serializer, usesSymbols, _i, _len, _ref, _ref1, _results;
    $svg = $(this.buildSvg(svg, "main"));
    images = $("img.shadow-icon", $jqueryContext);
    _results = [];
    for (_i = 0, _len = images.length; _i < _len; _i++) {
      image = images[_i];
      id = $(image).attr("data-src");
      scalable = ((_ref = $(image).attr("scalable")) != null ? _ref.toUpperCase() : void 0) === 'TRUE';
      scalable || (scalable = ((_ref1 = $(image).attr("data-scalable")) != null ? _ref1.toUpperCase() : void 0) === 'TRUE');
      $targetSvg = $("#" + id, $svg)[0];
      usesSymbols = $("use", $targetSvg).length !== 0;
      if ($targetSvg == null) {
        _results.push(console.error("Shadow Icons : Tried to add an SVG with the id '" + id + "', but a SVG with id doesn't exist in the library SVG."));
      } else {
        serializer = new XMLSerializer();
        rawHtml = serializer.serializeToString($targetSvg);
        if (usesSymbols) {
          newNode = $(this.buildSvg(rawHtml, id, pxSymbolString));
        } else {
          newNode = $(this.buildSvg(rawHtml, id));
        }
        $('body').append(newNode);
        box = newNode[0].getBBox();
        box.width = Math.round(box.width);
        box.height = Math.round(box.height);
        if (scalable) {
          newNode.get(0).setAttribute("viewBox", "0 0 " + (box.width + 8) + " " + (box.height + 8));
          $holder = $("<div class='holder'><div>");
          $holder.css({
            "max-width": "" + (box.width + 8) + "px",
            "max-height": "" + (box.height + 8) + "px",
            "width": "100%",
            "display": "inline-block"
          });
          $holder.append(newNode);
          _results.push($(image).replaceWith($holder));
        } else {
          newNode.attr({
            width: "" + (box.width + 8) + "px",
            height: "" + (box.height + 8) + "px"
          });
          _results.push($(image).replaceWith(newNode));
        }
      }
    }
    return _results;
  };

  ShadowIcons.prototype.buildSvg = function(svgSubElement, id, symbols) {
    if (symbols == null) {
      symbols = "";
    }
    return "<svg id=\"" + id + "\" preserveAspectRatio= \"xMinYMin meet\" class=\"pagoda-icon\" version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\">\n  " + symbols + "\n  " + svgSubElement + "\n</svg>";
  };

  return ShadowIcons;

})();

pxicons = {};

pxicons.ShadowIcons = ShadowIcons;

/*!
 * jQuery JavaScript Library v2.1.3
 * http://jquery.com/
 *
 * Includes Sizzle.js
 * http://sizzlejs.com/
 *
 * Copyright 2005, 2014 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2014-12-18T15:11Z
 */

(function( global, factory ) {

	if ( typeof module === "object" && typeof module.exports === "object" ) {
		// For CommonJS and CommonJS-like environments where a proper `window`
		// is present, execute the factory and get jQuery.
		// For environments that do not have a `window` with a `document`
		// (such as Node.js), expose a factory as module.exports.
		// This accentuates the need for the creation of a real `window`.
		// e.g. var jQuery = require("jquery")(window);
		// See ticket #14549 for more info.
		module.exports = global.document ?
			factory( global, true ) :
			function( w ) {
				if ( !w.document ) {
					throw new Error( "jQuery requires a window with a document" );
				}
				return factory( w );
			};
	} else {
		factory( global );
	}

// Pass this if window is not defined yet
}(typeof window !== "undefined" ? window : this, function( window, noGlobal ) {

// Support: Firefox 18+
// Can't be in strict mode, several libs including ASP.NET trace
// the stack via arguments.caller.callee and Firefox dies if
// you try to trace through "use strict" call chains. (#13335)
//

var arr = [];

var slice = arr.slice;

var concat = arr.concat;

var push = arr.push;

var indexOf = arr.indexOf;

var class2type = {};

var toString = class2type.toString;

var hasOwn = class2type.hasOwnProperty;

var support = {};



var
	// Use the correct document accordingly with window argument (sandbox)
	document = window.document,

	version = "2.1.3",

	// Define a local copy of jQuery
	jQuery = function( selector, context ) {
		// The jQuery object is actually just the init constructor 'enhanced'
		// Need init if jQuery is called (just allow error to be thrown if not included)
		return new jQuery.fn.init( selector, context );
	},

	// Support: Android<4.1
	// Make sure we trim BOM and NBSP
	rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,

	// Matches dashed string for camelizing
	rmsPrefix = /^-ms-/,
	rdashAlpha = /-([\da-z])/gi,

	// Used by jQuery.camelCase as callback to replace()
	fcamelCase = function( all, letter ) {
		return letter.toUpperCase();
	};

jQuery.fn = jQuery.prototype = {
	// The current version of jQuery being used
	jquery: version,

	constructor: jQuery,

	// Start with an empty selector
	selector: "",

	// The default length of a jQuery object is 0
	length: 0,

	toArray: function() {
		return slice.call( this );
	},

	// Get the Nth element in the matched element set OR
	// Get the whole matched element set as a clean array
	get: function( num ) {
		return num != null ?

			// Return just the one element from the set
			( num < 0 ? this[ num + this.length ] : this[ num ] ) :

			// Return all the elements in a clean array
			slice.call( this );
	},

	// Take an array of elements and push it onto the stack
	// (returning the new matched element set)
	pushStack: function( elems ) {

		// Build a new jQuery matched element set
		var ret = jQuery.merge( this.constructor(), elems );

		// Add the old object onto the stack (as a reference)
		ret.prevObject = this;
		ret.context = this.context;

		// Return the newly-formed element set
		return ret;
	},

	// Execute a callback for every element in the matched set.
	// (You can seed the arguments with an array of args, but this is
	// only used internally.)
	each: function( callback, args ) {
		return jQuery.each( this, callback, args );
	},

	map: function( callback ) {
		return this.pushStack( jQuery.map(this, function( elem, i ) {
			return callback.call( elem, i, elem );
		}));
	},

	slice: function() {
		return this.pushStack( slice.apply( this, arguments ) );
	},

	first: function() {
		return this.eq( 0 );
	},

	last: function() {
		return this.eq( -1 );
	},

	eq: function( i ) {
		var len = this.length,
			j = +i + ( i < 0 ? len : 0 );
		return this.pushStack( j >= 0 && j < len ? [ this[j] ] : [] );
	},

	end: function() {
		return this.prevObject || this.constructor(null);
	},

	// For internal use only.
	// Behaves like an Array's method, not like a jQuery method.
	push: push,
	sort: arr.sort,
	splice: arr.splice
};

jQuery.extend = jQuery.fn.extend = function() {
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[0] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;

		// Skip the boolean and the target
		target = arguments[ i ] || {};
		i++;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && !jQuery.isFunction(target) ) {
		target = {};
	}

	// Extend jQuery itself if only one argument is passed
	if ( i === length ) {
		target = this;
		i--;
	}

	for ( ; i < length; i++ ) {
		// Only deal with non-null/undefined values
		if ( (options = arguments[ i ]) != null ) {
			// Extend the base object
			for ( name in options ) {
				src = target[ name ];
				copy = options[ name ];

				// Prevent never-ending loop
				if ( target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {
					if ( copyIsArray ) {
						copyIsArray = false;
						clone = src && jQuery.isArray(src) ? src : [];

					} else {
						clone = src && jQuery.isPlainObject(src) ? src : {};
					}

					// Never move original objects, clone them
					target[ name ] = jQuery.extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

jQuery.extend({
	// Unique for each copy of jQuery on the page
	expando: "jQuery" + ( version + Math.random() ).replace( /\D/g, "" ),

	// Assume jQuery is ready without the ready module
	isReady: true,

	error: function( msg ) {
		throw new Error( msg );
	},

	noop: function() {},

	isFunction: function( obj ) {
		return jQuery.type(obj) === "function";
	},

	isArray: Array.isArray,

	isWindow: function( obj ) {
		return obj != null && obj === obj.window;
	},

	isNumeric: function( obj ) {
		// parseFloat NaNs numeric-cast false positives (null|true|false|"")
		// ...but misinterprets leading-number strings, particularly hex literals ("0x...")
		// subtraction forces infinities to NaN
		// adding 1 corrects loss of precision from parseFloat (#15100)
		return !jQuery.isArray( obj ) && (obj - parseFloat( obj ) + 1) >= 0;
	},

	isPlainObject: function( obj ) {
		// Not plain objects:
		// - Any object or value whose internal [[Class]] property is not "[object Object]"
		// - DOM nodes
		// - window
		if ( jQuery.type( obj ) !== "object" || obj.nodeType || jQuery.isWindow( obj ) ) {
			return false;
		}

		if ( obj.constructor &&
				!hasOwn.call( obj.constructor.prototype, "isPrototypeOf" ) ) {
			return false;
		}

		// If the function hasn't returned already, we're confident that
		// |obj| is a plain object, created by {} or constructed with new Object
		return true;
	},

	isEmptyObject: function( obj ) {
		var name;
		for ( name in obj ) {
			return false;
		}
		return true;
	},

	type: function( obj ) {
		if ( obj == null ) {
			return obj + "";
		}
		// Support: Android<4.0, iOS<6 (functionish RegExp)
		return typeof obj === "object" || typeof obj === "function" ?
			class2type[ toString.call(obj) ] || "object" :
			typeof obj;
	},

	// Evaluates a script in a global context
	globalEval: function( code ) {
		var script,
			indirect = eval;

		code = jQuery.trim( code );

		if ( code ) {
			// If the code includes a valid, prologue position
			// strict mode pragma, execute code by injecting a
			// script tag into the document.
			if ( code.indexOf("use strict") === 1 ) {
				script = document.createElement("script");
				script.text = code;
				document.head.appendChild( script ).parentNode.removeChild( script );
			} else {
			// Otherwise, avoid the DOM node creation, insertion
			// and removal by using an indirect global eval
				indirect( code );
			}
		}
	},

	// Convert dashed to camelCase; used by the css and data modules
	// Support: IE9-11+
	// Microsoft forgot to hump their vendor prefix (#9572)
	camelCase: function( string ) {
		return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
	},

	nodeName: function( elem, name ) {
		return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();
	},

	// args is for internal usage only
	each: function( obj, callback, args ) {
		var value,
			i = 0,
			length = obj.length,
			isArray = isArraylike( obj );

		if ( args ) {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			}

		// A special, fast, case for the most common use of each
		} else {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			}
		}

		return obj;
	},

	// Support: Android<4.1
	trim: function( text ) {
		return text == null ?
			"" :
			( text + "" ).replace( rtrim, "" );
	},

	// results is for internal usage only
	makeArray: function( arr, results ) {
		var ret = results || [];

		if ( arr != null ) {
			if ( isArraylike( Object(arr) ) ) {
				jQuery.merge( ret,
					typeof arr === "string" ?
					[ arr ] : arr
				);
			} else {
				push.call( ret, arr );
			}
		}

		return ret;
	},

	inArray: function( elem, arr, i ) {
		return arr == null ? -1 : indexOf.call( arr, elem, i );
	},

	merge: function( first, second ) {
		var len = +second.length,
			j = 0,
			i = first.length;

		for ( ; j < len; j++ ) {
			first[ i++ ] = second[ j ];
		}

		first.length = i;

		return first;
	},

	grep: function( elems, callback, invert ) {
		var callbackInverse,
			matches = [],
			i = 0,
			length = elems.length,
			callbackExpect = !invert;

		// Go through the array, only saving the items
		// that pass the validator function
		for ( ; i < length; i++ ) {
			callbackInverse = !callback( elems[ i ], i );
			if ( callbackInverse !== callbackExpect ) {
				matches.push( elems[ i ] );
			}
		}

		return matches;
	},

	// arg is for internal usage only
	map: function( elems, callback, arg ) {
		var value,
			i = 0,
			length = elems.length,
			isArray = isArraylike( elems ),
			ret = [];

		// Go through the array, translating each of the items to their new values
		if ( isArray ) {
			for ( ; i < length; i++ ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}

		// Go through every key on the object,
		} else {
			for ( i in elems ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}
		}

		// Flatten any nested arrays
		return concat.apply( [], ret );
	},

	// A global GUID counter for objects
	guid: 1,

	// Bind a function to a context, optionally partially applying any
	// arguments.
	proxy: function( fn, context ) {
		var tmp, args, proxy;

		if ( typeof context === "string" ) {
			tmp = fn[ context ];
			context = fn;
			fn = tmp;
		}

		// Quick check to determine if target is callable, in the spec
		// this throws a TypeError, but we will just return undefined.
		if ( !jQuery.isFunction( fn ) ) {
			return undefined;
		}

		// Simulated bind
		args = slice.call( arguments, 2 );
		proxy = function() {
			return fn.apply( context || this, args.concat( slice.call( arguments ) ) );
		};

		// Set the guid of unique handler to the same of original handler, so it can be removed
		proxy.guid = fn.guid = fn.guid || jQuery.guid++;

		return proxy;
	},

	now: Date.now,

	// jQuery.support is not used in Core but other projects attach their
	// properties to it so it needs to exist.
	support: support
});

// Populate the class2type map
jQuery.each("Boolean Number String Function Array Date RegExp Object Error".split(" "), function(i, name) {
	class2type[ "[object " + name + "]" ] = name.toLowerCase();
});

function isArraylike( obj ) {
	var length = obj.length,
		type = jQuery.type( obj );

	if ( type === "function" || jQuery.isWindow( obj ) ) {
		return false;
	}

	if ( obj.nodeType === 1 && length ) {
		return true;
	}

	return type === "array" || length === 0 ||
		typeof length === "number" && length > 0 && ( length - 1 ) in obj;
}
var Sizzle =
/*!
 * Sizzle CSS Selector Engine v2.2.0-pre
 * http://sizzlejs.com/
 *
 * Copyright 2008, 2014 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2014-12-16
 */
(function( window ) {

var i,
	support,
	Expr,
	getText,
	isXML,
	tokenize,
	compile,
	select,
	outermostContext,
	sortInput,
	hasDuplicate,

	// Local document vars
	setDocument,
	document,
	docElem,
	documentIsHTML,
	rbuggyQSA,
	rbuggyMatches,
	matches,
	contains,

	// Instance-specific data
	expando = "sizzle" + 1 * new Date(),
	preferredDoc = window.document,
	dirruns = 0,
	done = 0,
	classCache = createCache(),
	tokenCache = createCache(),
	compilerCache = createCache(),
	sortOrder = function( a, b ) {
		if ( a === b ) {
			hasDuplicate = true;
		}
		return 0;
	},

	// General-purpose constants
	MAX_NEGATIVE = 1 << 31,

	// Instance methods
	hasOwn = ({}).hasOwnProperty,
	arr = [],
	pop = arr.pop,
	push_native = arr.push,
	push = arr.push,
	slice = arr.slice,
	// Use a stripped-down indexOf as it's faster than native
	// http://jsperf.com/thor-indexof-vs-for/5
	indexOf = function( list, elem ) {
		var i = 0,
			len = list.length;
		for ( ; i < len; i++ ) {
			if ( list[i] === elem ) {
				return i;
			}
		}
		return -1;
	},

	booleans = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",

	// Regular expressions

	// Whitespace characters http://www.w3.org/TR/css3-selectors/#whitespace
	whitespace = "[\\x20\\t\\r\\n\\f]",
	// http://www.w3.org/TR/css3-syntax/#characters
	characterEncoding = "(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",

	// Loosely modeled on CSS identifier characters
	// An unquoted value should be a CSS identifier http://www.w3.org/TR/css3-selectors/#attribute-selectors
	// Proper syntax: http://www.w3.org/TR/CSS21/syndata.html#value-def-identifier
	identifier = characterEncoding.replace( "w", "w#" ),

	// Attribute selectors: http://www.w3.org/TR/selectors/#attribute-selectors
	attributes = "\\[" + whitespace + "*(" + characterEncoding + ")(?:" + whitespace +
		// Operator (capture 2)
		"*([*^$|!~]?=)" + whitespace +
		// "Attribute values must be CSS identifiers [capture 5] or strings [capture 3 or capture 4]"
		"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + identifier + "))|)" + whitespace +
		"*\\]",

	pseudos = ":(" + characterEncoding + ")(?:\\((" +
		// To reduce the number of selectors needing tokenize in the preFilter, prefer arguments:
		// 1. quoted (capture 3; capture 4 or capture 5)
		"('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|" +
		// 2. simple (capture 6)
		"((?:\\\\.|[^\\\\()[\\]]|" + attributes + ")*)|" +
		// 3. anything else (capture 2)
		".*" +
		")\\)|)",

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rwhitespace = new RegExp( whitespace + "+", "g" ),
	rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),

	rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
	rcombinators = new RegExp( "^" + whitespace + "*([>+~]|" + whitespace + ")" + whitespace + "*" ),

	rattributeQuotes = new RegExp( "=" + whitespace + "*([^\\]'\"]*?)" + whitespace + "*\\]", "g" ),

	rpseudo = new RegExp( pseudos ),
	ridentifier = new RegExp( "^" + identifier + "$" ),

	matchExpr = {
		"ID": new RegExp( "^#(" + characterEncoding + ")" ),
		"CLASS": new RegExp( "^\\.(" + characterEncoding + ")" ),
		"TAG": new RegExp( "^(" + characterEncoding.replace( "w", "w*" ) + ")" ),
		"ATTR": new RegExp( "^" + attributes ),
		"PSEUDO": new RegExp( "^" + pseudos ),
		"CHILD": new RegExp( "^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + whitespace +
			"*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace +
			"*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
		"bool": new RegExp( "^(?:" + booleans + ")$", "i" ),
		// For use in libraries implementing .is()
		// We use this for POS matching in `select`
		"needsContext": new RegExp( "^" + whitespace + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" +
			whitespace + "*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
	},

	rinputs = /^(?:input|select|textarea|button)$/i,
	rheader = /^h\d$/i,

	rnative = /^[^{]+\{\s*\[native \w/,

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

	rsibling = /[+~]/,
	rescape = /'|\\/g,

	// CSS escapes http://www.w3.org/TR/CSS21/syndata.html#escaped-characters
	runescape = new RegExp( "\\\\([\\da-f]{1,6}" + whitespace + "?|(" + whitespace + ")|.)", "ig" ),
	funescape = function( _, escaped, escapedWhitespace ) {
		var high = "0x" + escaped - 0x10000;
		// NaN means non-codepoint
		// Support: Firefox<24
		// Workaround erroneous numeric interpretation of +"0x"
		return high !== high || escapedWhitespace ?
			escaped :
			high < 0 ?
				// BMP codepoint
				String.fromCharCode( high + 0x10000 ) :
				// Supplemental Plane codepoint (surrogate pair)
				String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
	},

	// Used for iframes
	// See setDocument()
	// Removing the function wrapper causes a "Permission Denied"
	// error in IE
	unloadHandler = function() {
		setDocument();
	};

// Optimize for push.apply( _, NodeList )
try {
	push.apply(
		(arr = slice.call( preferredDoc.childNodes )),
		preferredDoc.childNodes
	);
	// Support: Android<4.0
	// Detect silently failing push.apply
	arr[ preferredDoc.childNodes.length ].nodeType;
} catch ( e ) {
	push = { apply: arr.length ?

		// Leverage slice if possible
		function( target, els ) {
			push_native.apply( target, slice.call(els) );
		} :

		// Support: IE<9
		// Otherwise append directly
		function( target, els ) {
			var j = target.length,
				i = 0;
			// Can't trust NodeList.length
			while ( (target[j++] = els[i++]) ) {}
			target.length = j - 1;
		}
	};
}

function Sizzle( selector, context, results, seed ) {
	var match, elem, m, nodeType,
		// QSA vars
		i, groups, old, nid, newContext, newSelector;

	if ( ( context ? context.ownerDocument || context : preferredDoc ) !== document ) {
		setDocument( context );
	}

	context = context || document;
	results = results || [];
	nodeType = context.nodeType;

	if ( typeof selector !== "string" || !selector ||
		nodeType !== 1 && nodeType !== 9 && nodeType !== 11 ) {

		return results;
	}

	if ( !seed && documentIsHTML ) {

		// Try to shortcut find operations when possible (e.g., not under DocumentFragment)
		if ( nodeType !== 11 && (match = rquickExpr.exec( selector )) ) {
			// Speed-up: Sizzle("#ID")
			if ( (m = match[1]) ) {
				if ( nodeType === 9 ) {
					elem = context.getElementById( m );
					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document (jQuery #6963)
					if ( elem && elem.parentNode ) {
						// Handle the case where IE, Opera, and Webkit return items
						// by name instead of ID
						if ( elem.id === m ) {
							results.push( elem );
							return results;
						}
					} else {
						return results;
					}
				} else {
					// Context is not a document
					if ( context.ownerDocument && (elem = context.ownerDocument.getElementById( m )) &&
						contains( context, elem ) && elem.id === m ) {
						results.push( elem );
						return results;
					}
				}

			// Speed-up: Sizzle("TAG")
			} else if ( match[2] ) {
				push.apply( results, context.getElementsByTagName( selector ) );
				return results;

			// Speed-up: Sizzle(".CLASS")
			} else if ( (m = match[3]) && support.getElementsByClassName ) {
				push.apply( results, context.getElementsByClassName( m ) );
				return results;
			}
		}

		// QSA path
		if ( support.qsa && (!rbuggyQSA || !rbuggyQSA.test( selector )) ) {
			nid = old = expando;
			newContext = context;
			newSelector = nodeType !== 1 && selector;

			// qSA works strangely on Element-rooted queries
			// We can work around this by specifying an extra ID on the root
			// and working up from there (Thanks to Andrew Dupont for the technique)
			// IE 8 doesn't work on object elements
			if ( nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
				groups = tokenize( selector );

				if ( (old = context.getAttribute("id")) ) {
					nid = old.replace( rescape, "\\$&" );
				} else {
					context.setAttribute( "id", nid );
				}
				nid = "[id='" + nid + "'] ";

				i = groups.length;
				while ( i-- ) {
					groups[i] = nid + toSelector( groups[i] );
				}
				newContext = rsibling.test( selector ) && testContext( context.parentNode ) || context;
				newSelector = groups.join(",");
			}

			if ( newSelector ) {
				try {
					push.apply( results,
						newContext.querySelectorAll( newSelector )
					);
					return results;
				} catch(qsaError) {
				} finally {
					if ( !old ) {
						context.removeAttribute("id");
					}
				}
			}
		}
	}

	// All others
	return select( selector.replace( rtrim, "$1" ), context, results, seed );
}

/**
 * Create key-value caches of limited size
 * @returns {Function(string, Object)} Returns the Object data after storing it on itself with
 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
 *	deleting the oldest entry
 */
function createCache() {
	var keys = [];

	function cache( key, value ) {
		// Use (key + " ") to avoid collision with native prototype properties (see Issue #157)
		if ( keys.push( key + " " ) > Expr.cacheLength ) {
			// Only keep the most recent entries
			delete cache[ keys.shift() ];
		}
		return (cache[ key + " " ] = value);
	}
	return cache;
}

/**
 * Mark a function for special use by Sizzle
 * @param {Function} fn The function to mark
 */
function markFunction( fn ) {
	fn[ expando ] = true;
	return fn;
}

/**
 * Support testing using an element
 * @param {Function} fn Passed the created div and expects a boolean result
 */
function assert( fn ) {
	var div = document.createElement("div");

	try {
		return !!fn( div );
	} catch (e) {
		return false;
	} finally {
		// Remove from its parent by default
		if ( div.parentNode ) {
			div.parentNode.removeChild( div );
		}
		// release memory in IE
		div = null;
	}
}

/**
 * Adds the same handler for all of the specified attrs
 * @param {String} attrs Pipe-separated list of attributes
 * @param {Function} handler The method that will be applied
 */
function addHandle( attrs, handler ) {
	var arr = attrs.split("|"),
		i = attrs.length;

	while ( i-- ) {
		Expr.attrHandle[ arr[i] ] = handler;
	}
}

/**
 * Checks document order of two siblings
 * @param {Element} a
 * @param {Element} b
 * @returns {Number} Returns less than 0 if a precedes b, greater than 0 if a follows b
 */
function siblingCheck( a, b ) {
	var cur = b && a,
		diff = cur && a.nodeType === 1 && b.nodeType === 1 &&
			( ~b.sourceIndex || MAX_NEGATIVE ) -
			( ~a.sourceIndex || MAX_NEGATIVE );

	// Use IE sourceIndex if available on both nodes
	if ( diff ) {
		return diff;
	}

	// Check if b follows a
	if ( cur ) {
		while ( (cur = cur.nextSibling) ) {
			if ( cur === b ) {
				return -1;
			}
		}
	}

	return a ? 1 : -1;
}

/**
 * Returns a function to use in pseudos for input types
 * @param {String} type
 */
function createInputPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return name === "input" && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for buttons
 * @param {String} type
 */
function createButtonPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return (name === "input" || name === "button") && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for positionals
 * @param {Function} fn
 */
function createPositionalPseudo( fn ) {
	return markFunction(function( argument ) {
		argument = +argument;
		return markFunction(function( seed, matches ) {
			var j,
				matchIndexes = fn( [], seed.length, argument ),
				i = matchIndexes.length;

			// Match elements found at the specified indexes
			while ( i-- ) {
				if ( seed[ (j = matchIndexes[i]) ] ) {
					seed[j] = !(matches[j] = seed[j]);
				}
			}
		});
	});
}

/**
 * Checks a node for validity as a Sizzle context
 * @param {Element|Object=} context
 * @returns {Element|Object|Boolean} The input node if acceptable, otherwise a falsy value
 */
function testContext( context ) {
	return context && typeof context.getElementsByTagName !== "undefined" && context;
}

// Expose support vars for convenience
support = Sizzle.support = {};

/**
 * Detects XML nodes
 * @param {Element|Object} elem An element or a document
 * @returns {Boolean} True iff elem is a non-HTML XML node
 */
isXML = Sizzle.isXML = function( elem ) {
	// documentElement is verified for cases where it doesn't yet exist
	// (such as loading iframes in IE - #4833)
	var documentElement = elem && (elem.ownerDocument || elem).documentElement;
	return documentElement ? documentElement.nodeName !== "HTML" : false;
};

/**
 * Sets document-related variables once based on the current document
 * @param {Element|Object} [doc] An element or document object to use to set the document
 * @returns {Object} Returns the current document
 */
setDocument = Sizzle.setDocument = function( node ) {
	var hasCompare, parent,
		doc = node ? node.ownerDocument || node : preferredDoc;

	// If no document and documentElement is available, return
	if ( doc === document || doc.nodeType !== 9 || !doc.documentElement ) {
		return document;
	}

	// Set our document
	document = doc;
	docElem = doc.documentElement;
	parent = doc.defaultView;

	// Support: IE>8
	// If iframe document is assigned to "document" variable and if iframe has been reloaded,
	// IE will throw "permission denied" error when accessing "document" variable, see jQuery #13936
	// IE6-8 do not support the defaultView property so parent will be undefined
	if ( parent && parent !== parent.top ) {
		// IE11 does not have attachEvent, so all must suffer
		if ( parent.addEventListener ) {
			parent.addEventListener( "unload", unloadHandler, false );
		} else if ( parent.attachEvent ) {
			parent.attachEvent( "onunload", unloadHandler );
		}
	}

	/* Support tests
	---------------------------------------------------------------------- */
	documentIsHTML = !isXML( doc );

	/* Attributes
	---------------------------------------------------------------------- */

	// Support: IE<8
	// Verify that getAttribute really returns attributes and not properties
	// (excepting IE8 booleans)
	support.attributes = assert(function( div ) {
		div.className = "i";
		return !div.getAttribute("className");
	});

	/* getElement(s)By*
	---------------------------------------------------------------------- */

	// Check if getElementsByTagName("*") returns only elements
	support.getElementsByTagName = assert(function( div ) {
		div.appendChild( doc.createComment("") );
		return !div.getElementsByTagName("*").length;
	});

	// Support: IE<9
	support.getElementsByClassName = rnative.test( doc.getElementsByClassName );

	// Support: IE<10
	// Check if getElementById returns elements by name
	// The broken getElementById methods don't pick up programatically-set names,
	// so use a roundabout getElementsByName test
	support.getById = assert(function( div ) {
		docElem.appendChild( div ).id = expando;
		return !doc.getElementsByName || !doc.getElementsByName( expando ).length;
	});

	// ID find and filter
	if ( support.getById ) {
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
				var m = context.getElementById( id );
				// Check parentNode to catch when Blackberry 4.6 returns
				// nodes that are no longer in the document #6963
				return m && m.parentNode ? [ m ] : [];
			}
		};
		Expr.filter["ID"] = function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				return elem.getAttribute("id") === attrId;
			};
		};
	} else {
		// Support: IE6/7
		// getElementById is not reliable as a find shortcut
		delete Expr.find["ID"];

		Expr.filter["ID"] =  function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				var node = typeof elem.getAttributeNode !== "undefined" && elem.getAttributeNode("id");
				return node && node.value === attrId;
			};
		};
	}

	// Tag
	Expr.find["TAG"] = support.getElementsByTagName ?
		function( tag, context ) {
			if ( typeof context.getElementsByTagName !== "undefined" ) {
				return context.getElementsByTagName( tag );

			// DocumentFragment nodes don't have gEBTN
			} else if ( support.qsa ) {
				return context.querySelectorAll( tag );
			}
		} :

		function( tag, context ) {
			var elem,
				tmp = [],
				i = 0,
				// By happy coincidence, a (broken) gEBTN appears on DocumentFragment nodes too
				results = context.getElementsByTagName( tag );

			// Filter out possible comments
			if ( tag === "*" ) {
				while ( (elem = results[i++]) ) {
					if ( elem.nodeType === 1 ) {
						tmp.push( elem );
					}
				}

				return tmp;
			}
			return results;
		};

	// Class
	Expr.find["CLASS"] = support.getElementsByClassName && function( className, context ) {
		if ( documentIsHTML ) {
			return context.getElementsByClassName( className );
		}
	};

	/* QSA/matchesSelector
	---------------------------------------------------------------------- */

	// QSA and matchesSelector support

	// matchesSelector(:active) reports false when true (IE9/Opera 11.5)
	rbuggyMatches = [];

	// qSa(:focus) reports false when true (Chrome 21)
	// We allow this because of a bug in IE8/9 that throws an error
	// whenever `document.activeElement` is accessed on an iframe
	// So, we allow :focus to pass through QSA all the time to avoid the IE error
	// See http://bugs.jquery.com/ticket/13378
	rbuggyQSA = [];

	if ( (support.qsa = rnative.test( doc.querySelectorAll )) ) {
		// Build QSA regex
		// Regex strategy adopted from Diego Perini
		assert(function( div ) {
			// Select is set to empty string on purpose
			// This is to test IE's treatment of not explicitly
			// setting a boolean content attribute,
			// since its presence should be enough
			// http://bugs.jquery.com/ticket/12359
			docElem.appendChild( div ).innerHTML = "<a id='" + expando + "'></a>" +
				"<select id='" + expando + "-\f]' msallowcapture=''>" +
				"<option selected=''></option></select>";

			// Support: IE8, Opera 11-12.16
			// Nothing should be selected when empty strings follow ^= or $= or *=
			// The test attribute must be unknown in Opera but "safe" for WinRT
			// http://msdn.microsoft.com/en-us/library/ie/hh465388.aspx#attribute_section
			if ( div.querySelectorAll("[msallowcapture^='']").length ) {
				rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:''|\"\")" );
			}

			// Support: IE8
			// Boolean attributes and "value" are not treated correctly
			if ( !div.querySelectorAll("[selected]").length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*(?:value|" + booleans + ")" );
			}

			// Support: Chrome<29, Android<4.2+, Safari<7.0+, iOS<7.0+, PhantomJS<1.9.7+
			if ( !div.querySelectorAll( "[id~=" + expando + "-]" ).length ) {
				rbuggyQSA.push("~=");
			}

			// Webkit/Opera - :checked should return selected option elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":checked").length ) {
				rbuggyQSA.push(":checked");
			}

			// Support: Safari 8+, iOS 8+
			// https://bugs.webkit.org/show_bug.cgi?id=136851
			// In-page `selector#id sibing-combinator selector` fails
			if ( !div.querySelectorAll( "a#" + expando + "+*" ).length ) {
				rbuggyQSA.push(".#.+[+~]");
			}
		});

		assert(function( div ) {
			// Support: Windows 8 Native Apps
			// The type and name attributes are restricted during .innerHTML assignment
			var input = doc.createElement("input");
			input.setAttribute( "type", "hidden" );
			div.appendChild( input ).setAttribute( "name", "D" );

			// Support: IE8
			// Enforce case-sensitivity of name attribute
			if ( div.querySelectorAll("[name=d]").length ) {
				rbuggyQSA.push( "name" + whitespace + "*[*^$|!~]?=" );
			}

			// FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":enabled").length ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Opera 10-11 does not throw on post-comma invalid pseudos
			div.querySelectorAll("*,:x");
			rbuggyQSA.push(",.*:");
		});
	}

	if ( (support.matchesSelector = rnative.test( (matches = docElem.matches ||
		docElem.webkitMatchesSelector ||
		docElem.mozMatchesSelector ||
		docElem.oMatchesSelector ||
		docElem.msMatchesSelector) )) ) {

		assert(function( div ) {
			// Check to see if it's possible to do matchesSelector
			// on a disconnected node (IE 9)
			support.disconnectedMatch = matches.call( div, "div" );

			// This should fail with an exception
			// Gecko does not error, returns false instead
			matches.call( div, "[s!='']:x" );
			rbuggyMatches.push( "!=", pseudos );
		});
	}

	rbuggyQSA = rbuggyQSA.length && new RegExp( rbuggyQSA.join("|") );
	rbuggyMatches = rbuggyMatches.length && new RegExp( rbuggyMatches.join("|") );

	/* Contains
	---------------------------------------------------------------------- */
	hasCompare = rnative.test( docElem.compareDocumentPosition );

	// Element contains another
	// Purposefully does not implement inclusive descendent
	// As in, an element does not contain itself
	contains = hasCompare || rnative.test( docElem.contains ) ?
		function( a, b ) {
			var adown = a.nodeType === 9 ? a.documentElement : a,
				bup = b && b.parentNode;
			return a === bup || !!( bup && bup.nodeType === 1 && (
				adown.contains ?
					adown.contains( bup ) :
					a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
			));
		} :
		function( a, b ) {
			if ( b ) {
				while ( (b = b.parentNode) ) {
					if ( b === a ) {
						return true;
					}
				}
			}
			return false;
		};

	/* Sorting
	---------------------------------------------------------------------- */

	// Document order sorting
	sortOrder = hasCompare ?
	function( a, b ) {

		// Flag for duplicate removal
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		// Sort on method existence if only one input has compareDocumentPosition
		var compare = !a.compareDocumentPosition - !b.compareDocumentPosition;
		if ( compare ) {
			return compare;
		}

		// Calculate position if both inputs belong to the same document
		compare = ( a.ownerDocument || a ) === ( b.ownerDocument || b ) ?
			a.compareDocumentPosition( b ) :

			// Otherwise we know they are disconnected
			1;

		// Disconnected nodes
		if ( compare & 1 ||
			(!support.sortDetached && b.compareDocumentPosition( a ) === compare) ) {

			// Choose the first element that is related to our preferred document
			if ( a === doc || a.ownerDocument === preferredDoc && contains(preferredDoc, a) ) {
				return -1;
			}
			if ( b === doc || b.ownerDocument === preferredDoc && contains(preferredDoc, b) ) {
				return 1;
			}

			// Maintain original order
			return sortInput ?
				( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
				0;
		}

		return compare & 4 ? -1 : 1;
	} :
	function( a, b ) {
		// Exit early if the nodes are identical
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		var cur,
			i = 0,
			aup = a.parentNode,
			bup = b.parentNode,
			ap = [ a ],
			bp = [ b ];

		// Parentless nodes are either documents or disconnected
		if ( !aup || !bup ) {
			return a === doc ? -1 :
				b === doc ? 1 :
				aup ? -1 :
				bup ? 1 :
				sortInput ?
				( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
				0;

		// If the nodes are siblings, we can do a quick check
		} else if ( aup === bup ) {
			return siblingCheck( a, b );
		}

		// Otherwise we need full lists of their ancestors for comparison
		cur = a;
		while ( (cur = cur.parentNode) ) {
			ap.unshift( cur );
		}
		cur = b;
		while ( (cur = cur.parentNode) ) {
			bp.unshift( cur );
		}

		// Walk down the tree looking for a discrepancy
		while ( ap[i] === bp[i] ) {
			i++;
		}

		return i ?
			// Do a sibling check if the nodes have a common ancestor
			siblingCheck( ap[i], bp[i] ) :

			// Otherwise nodes in our document sort first
			ap[i] === preferredDoc ? -1 :
			bp[i] === preferredDoc ? 1 :
			0;
	};

	return doc;
};

Sizzle.matches = function( expr, elements ) {
	return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	// Make sure that attribute selectors are quoted
	expr = expr.replace( rattributeQuotes, "='$1']" );

	if ( support.matchesSelector && documentIsHTML &&
		( !rbuggyMatches || !rbuggyMatches.test( expr ) ) &&
		( !rbuggyQSA     || !rbuggyQSA.test( expr ) ) ) {

		try {
			var ret = matches.call( elem, expr );

			// IE 9's matchesSelector returns false on disconnected nodes
			if ( ret || support.disconnectedMatch ||
					// As well, disconnected nodes are said to be in a document
					// fragment in IE 9
					elem.document && elem.document.nodeType !== 11 ) {
				return ret;
			}
		} catch (e) {}
	}

	return Sizzle( expr, document, null, [ elem ] ).length > 0;
};

Sizzle.contains = function( context, elem ) {
	// Set document vars if needed
	if ( ( context.ownerDocument || context ) !== document ) {
		setDocument( context );
	}
	return contains( context, elem );
};

Sizzle.attr = function( elem, name ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	var fn = Expr.attrHandle[ name.toLowerCase() ],
		// Don't get fooled by Object.prototype properties (jQuery #13807)
		val = fn && hasOwn.call( Expr.attrHandle, name.toLowerCase() ) ?
			fn( elem, name, !documentIsHTML ) :
			undefined;

	return val !== undefined ?
		val :
		support.attributes || !documentIsHTML ?
			elem.getAttribute( name ) :
			(val = elem.getAttributeNode(name)) && val.specified ?
				val.value :
				null;
};

Sizzle.error = function( msg ) {
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

/**
 * Document sorting and removing duplicates
 * @param {ArrayLike} results
 */
Sizzle.uniqueSort = function( results ) {
	var elem,
		duplicates = [],
		j = 0,
		i = 0;

	// Unless we *know* we can detect duplicates, assume their presence
	hasDuplicate = !support.detectDuplicates;
	sortInput = !support.sortStable && results.slice( 0 );
	results.sort( sortOrder );

	if ( hasDuplicate ) {
		while ( (elem = results[i++]) ) {
			if ( elem === results[ i ] ) {
				j = duplicates.push( i );
			}
		}
		while ( j-- ) {
			results.splice( duplicates[ j ], 1 );
		}
	}

	// Clear input after sorting to release objects
	// See https://github.com/jquery/sizzle/pull/225
	sortInput = null;

	return results;
};

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
	var node,
		ret = "",
		i = 0,
		nodeType = elem.nodeType;

	if ( !nodeType ) {
		// If no nodeType, this is expected to be an array
		while ( (node = elem[i++]) ) {
			// Do not traverse comment nodes
			ret += getText( node );
		}
	} else if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
		// Use textContent for elements
		// innerText usage removed for consistency of new lines (jQuery #11153)
		if ( typeof elem.textContent === "string" ) {
			return elem.textContent;
		} else {
			// Traverse its children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				ret += getText( elem );
			}
		}
	} else if ( nodeType === 3 || nodeType === 4 ) {
		return elem.nodeValue;
	}
	// Do not include comment or processing instruction nodes

	return ret;
};

Expr = Sizzle.selectors = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	attrHandle: {},

	find: {},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: {
		"ATTR": function( match ) {
			match[1] = match[1].replace( runescape, funescape );

			// Move the given value to match[3] whether quoted or unquoted
			match[3] = ( match[3] || match[4] || match[5] || "" ).replace( runescape, funescape );

			if ( match[2] === "~=" ) {
				match[3] = " " + match[3] + " ";
			}

			return match.slice( 0, 4 );
		},

		"CHILD": function( match ) {
			/* matches from matchExpr["CHILD"]
				1 type (only|nth|...)
				2 what (child|of-type)
				3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
				4 xn-component of xn+y argument ([+-]?\d*n|)
				5 sign of xn-component
				6 x of xn-component
				7 sign of y-component
				8 y of y-component
			*/
			match[1] = match[1].toLowerCase();

			if ( match[1].slice( 0, 3 ) === "nth" ) {
				// nth-* requires argument
				if ( !match[3] ) {
					Sizzle.error( match[0] );
				}

				// numeric x and y parameters for Expr.filter.CHILD
				// remember that false/true cast respectively to 0/1
				match[4] = +( match[4] ? match[5] + (match[6] || 1) : 2 * ( match[3] === "even" || match[3] === "odd" ) );
				match[5] = +( ( match[7] + match[8] ) || match[3] === "odd" );

			// other types prohibit arguments
			} else if ( match[3] ) {
				Sizzle.error( match[0] );
			}

			return match;
		},

		"PSEUDO": function( match ) {
			var excess,
				unquoted = !match[6] && match[2];

			if ( matchExpr["CHILD"].test( match[0] ) ) {
				return null;
			}

			// Accept quoted arguments as-is
			if ( match[3] ) {
				match[2] = match[4] || match[5] || "";

			// Strip excess characters from unquoted arguments
			} else if ( unquoted && rpseudo.test( unquoted ) &&
				// Get excess from tokenize (recursively)
				(excess = tokenize( unquoted, true )) &&
				// advance to the next closing parenthesis
				(excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length) ) {

				// excess is a negative index
				match[0] = match[0].slice( 0, excess );
				match[2] = unquoted.slice( 0, excess );
			}

			// Return only captures needed by the pseudo filter method (type and argument)
			return match.slice( 0, 3 );
		}
	},

	filter: {

		"TAG": function( nodeNameSelector ) {
			var nodeName = nodeNameSelector.replace( runescape, funescape ).toLowerCase();
			return nodeNameSelector === "*" ?
				function() { return true; } :
				function( elem ) {
					return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
				};
		},

		"CLASS": function( className ) {
			var pattern = classCache[ className + " " ];

			return pattern ||
				(pattern = new RegExp( "(^|" + whitespace + ")" + className + "(" + whitespace + "|$)" )) &&
				classCache( className, function( elem ) {
					return pattern.test( typeof elem.className === "string" && elem.className || typeof elem.getAttribute !== "undefined" && elem.getAttribute("class") || "" );
				});
		},

		"ATTR": function( name, operator, check ) {
			return function( elem ) {
				var result = Sizzle.attr( elem, name );

				if ( result == null ) {
					return operator === "!=";
				}
				if ( !operator ) {
					return true;
				}

				result += "";

				return operator === "=" ? result === check :
					operator === "!=" ? result !== check :
					operator === "^=" ? check && result.indexOf( check ) === 0 :
					operator === "*=" ? check && result.indexOf( check ) > -1 :
					operator === "$=" ? check && result.slice( -check.length ) === check :
					operator === "~=" ? ( " " + result.replace( rwhitespace, " " ) + " " ).indexOf( check ) > -1 :
					operator === "|=" ? result === check || result.slice( 0, check.length + 1 ) === check + "-" :
					false;
			};
		},

		"CHILD": function( type, what, argument, first, last ) {
			var simple = type.slice( 0, 3 ) !== "nth",
				forward = type.slice( -4 ) !== "last",
				ofType = what === "of-type";

			return first === 1 && last === 0 ?

				// Shortcut for :nth-*(n)
				function( elem ) {
					return !!elem.parentNode;
				} :

				function( elem, context, xml ) {
					var cache, outerCache, node, diff, nodeIndex, start,
						dir = simple !== forward ? "nextSibling" : "previousSibling",
						parent = elem.parentNode,
						name = ofType && elem.nodeName.toLowerCase(),
						useCache = !xml && !ofType;

					if ( parent ) {

						// :(first|last|only)-(child|of-type)
						if ( simple ) {
							while ( dir ) {
								node = elem;
								while ( (node = node[ dir ]) ) {
									if ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) {
										return false;
									}
								}
								// Reverse direction for :only-* (if we haven't yet done so)
								start = dir = type === "only" && !start && "nextSibling";
							}
							return true;
						}

						start = [ forward ? parent.firstChild : parent.lastChild ];

						// non-xml :nth-child(...) stores cache data on `parent`
						if ( forward && useCache ) {
							// Seek `elem` from a previously-cached index
							outerCache = parent[ expando ] || (parent[ expando ] = {});
							cache = outerCache[ type ] || [];
							nodeIndex = cache[0] === dirruns && cache[1];
							diff = cache[0] === dirruns && cache[2];
							node = nodeIndex && parent.childNodes[ nodeIndex ];

							while ( (node = ++nodeIndex && node && node[ dir ] ||

								// Fallback to seeking `elem` from the start
								(diff = nodeIndex = 0) || start.pop()) ) {

								// When found, cache indexes on `parent` and break
								if ( node.nodeType === 1 && ++diff && node === elem ) {
									outerCache[ type ] = [ dirruns, nodeIndex, diff ];
									break;
								}
							}

						// Use previously-cached element index if available
						} else if ( useCache && (cache = (elem[ expando ] || (elem[ expando ] = {}))[ type ]) && cache[0] === dirruns ) {
							diff = cache[1];

						// xml :nth-child(...) or :nth-last-child(...) or :nth(-last)?-of-type(...)
						} else {
							// Use the same loop as above to seek `elem` from the start
							while ( (node = ++nodeIndex && node && node[ dir ] ||
								(diff = nodeIndex = 0) || start.pop()) ) {

								if ( ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) && ++diff ) {
									// Cache the index of each encountered element
									if ( useCache ) {
										(node[ expando ] || (node[ expando ] = {}))[ type ] = [ dirruns, diff ];
									}

									if ( node === elem ) {
										break;
									}
								}
							}
						}

						// Incorporate the offset, then check against cycle size
						diff -= last;
						return diff === first || ( diff % first === 0 && diff / first >= 0 );
					}
				};
		},

		"PSEUDO": function( pseudo, argument ) {
			// pseudo-class names are case-insensitive
			// http://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			// Remember that setFilters inherits from pseudos
			var args,
				fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
					Sizzle.error( "unsupported pseudo: " + pseudo );

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as Sizzle does
			if ( fn[ expando ] ) {
				return fn( argument );
			}

			// But maintain support for old signatures
			if ( fn.length > 1 ) {
				args = [ pseudo, pseudo, "", argument ];
				return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
					markFunction(function( seed, matches ) {
						var idx,
							matched = fn( seed, argument ),
							i = matched.length;
						while ( i-- ) {
							idx = indexOf( seed, matched[i] );
							seed[ idx ] = !( matches[ idx ] = matched[i] );
						}
					}) :
					function( elem ) {
						return fn( elem, 0, args );
					};
			}

			return fn;
		}
	},

	pseudos: {
		// Potentially complex pseudos
		"not": markFunction(function( selector ) {
			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var input = [],
				results = [],
				matcher = compile( selector.replace( rtrim, "$1" ) );

			return matcher[ expando ] ?
				markFunction(function( seed, matches, context, xml ) {
					var elem,
						unmatched = matcher( seed, null, xml, [] ),
						i = seed.length;

					// Match elements unmatched by `matcher`
					while ( i-- ) {
						if ( (elem = unmatched[i]) ) {
							seed[i] = !(matches[i] = elem);
						}
					}
				}) :
				function( elem, context, xml ) {
					input[0] = elem;
					matcher( input, null, xml, results );
					// Don't keep the element (issue #299)
					input[0] = null;
					return !results.pop();
				};
		}),

		"has": markFunction(function( selector ) {
			return function( elem ) {
				return Sizzle( selector, elem ).length > 0;
			};
		}),

		"contains": markFunction(function( text ) {
			text = text.replace( runescape, funescape );
			return function( elem ) {
				return ( elem.textContent || elem.innerText || getText( elem ) ).indexOf( text ) > -1;
			};
		}),

		// "Whether an element is represented by a :lang() selector
		// is based solely on the element's language value
		// being equal to the identifier C,
		// or beginning with the identifier C immediately followed by "-".
		// The matching of C against the element's language value is performed case-insensitively.
		// The identifier C does not have to be a valid language name."
		// http://www.w3.org/TR/selectors/#lang-pseudo
		"lang": markFunction( function( lang ) {
			// lang value must be a valid identifier
			if ( !ridentifier.test(lang || "") ) {
				Sizzle.error( "unsupported lang: " + lang );
			}
			lang = lang.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				var elemLang;
				do {
					if ( (elemLang = documentIsHTML ?
						elem.lang :
						elem.getAttribute("xml:lang") || elem.getAttribute("lang")) ) {

						elemLang = elemLang.toLowerCase();
						return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
					}
				} while ( (elem = elem.parentNode) && elem.nodeType === 1 );
				return false;
			};
		}),

		// Miscellaneous
		"target": function( elem ) {
			var hash = window.location && window.location.hash;
			return hash && hash.slice( 1 ) === elem.id;
		},

		"root": function( elem ) {
			return elem === docElem;
		},

		"focus": function( elem ) {
			return elem === document.activeElement && (!document.hasFocus || document.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
		},

		// Boolean properties
		"enabled": function( elem ) {
			return elem.disabled === false;
		},

		"disabled": function( elem ) {
			return elem.disabled === true;
		},

		"checked": function( elem ) {
			// In CSS3, :checked should return both checked and selected elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			var nodeName = elem.nodeName.toLowerCase();
			return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
		},

		"selected": function( elem ) {
			// Accessing this property makes selected-by-default
			// options in Safari work properly
			if ( elem.parentNode ) {
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		// Contents
		"empty": function( elem ) {
			// http://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is negated by element (1) or content nodes (text: 3; cdata: 4; entity ref: 5),
			//   but not by others (comment: 8; processing instruction: 7; etc.)
			// nodeType < 6 works because attributes (2) do not appear as children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				if ( elem.nodeType < 6 ) {
					return false;
				}
			}
			return true;
		},

		"parent": function( elem ) {
			return !Expr.pseudos["empty"]( elem );
		},

		// Element/input types
		"header": function( elem ) {
			return rheader.test( elem.nodeName );
		},

		"input": function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		"button": function( elem ) {
			var name = elem.nodeName.toLowerCase();
			return name === "input" && elem.type === "button" || name === "button";
		},

		"text": function( elem ) {
			var attr;
			return elem.nodeName.toLowerCase() === "input" &&
				elem.type === "text" &&

				// Support: IE<8
				// New HTML5 attribute values (e.g., "search") appear with elem.type === "text"
				( (attr = elem.getAttribute("type")) == null || attr.toLowerCase() === "text" );
		},

		// Position-in-collection
		"first": createPositionalPseudo(function() {
			return [ 0 ];
		}),

		"last": createPositionalPseudo(function( matchIndexes, length ) {
			return [ length - 1 ];
		}),

		"eq": createPositionalPseudo(function( matchIndexes, length, argument ) {
			return [ argument < 0 ? argument + length : argument ];
		}),

		"even": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 0;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"odd": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 1;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"lt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; --i >= 0; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"gt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; ++i < length; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		})
	}
};

Expr.pseudos["nth"] = Expr.pseudos["eq"];

// Add button/input type pseudos
for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
	Expr.pseudos[ i ] = createInputPseudo( i );
}
for ( i in { submit: true, reset: true } ) {
	Expr.pseudos[ i ] = createButtonPseudo( i );
}

// Easy API for creating new setFilters
function setFilters() {}
setFilters.prototype = Expr.filters = Expr.pseudos;
Expr.setFilters = new setFilters();

tokenize = Sizzle.tokenize = function( selector, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, preFilters,
		cached = tokenCache[ selector + " " ];

	if ( cached ) {
		return parseOnly ? 0 : cached.slice( 0 );
	}

	soFar = selector;
	groups = [];
	preFilters = Expr.preFilter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || (match = rcomma.exec( soFar )) ) {
			if ( match ) {
				// Don't consume trailing commas as valid
				soFar = soFar.slice( match[0].length ) || soFar;
			}
			groups.push( (tokens = []) );
		}

		matched = false;

		// Combinators
		if ( (match = rcombinators.exec( soFar )) ) {
			matched = match.shift();
			tokens.push({
				value: matched,
				// Cast descendant combinators to space
				type: match[0].replace( rtrim, " " )
			});
			soFar = soFar.slice( matched.length );
		}

		// Filters
		for ( type in Expr.filter ) {
			if ( (match = matchExpr[ type ].exec( soFar )) && (!preFilters[ type ] ||
				(match = preFilters[ type ]( match ))) ) {
				matched = match.shift();
				tokens.push({
					value: matched,
					type: type,
					matches: match
				});
				soFar = soFar.slice( matched.length );
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	return parseOnly ?
		soFar.length :
		soFar ?
			Sizzle.error( selector ) :
			// Cache the tokens
			tokenCache( selector, groups ).slice( 0 );
};

function toSelector( tokens ) {
	var i = 0,
		len = tokens.length,
		selector = "";
	for ( ; i < len; i++ ) {
		selector += tokens[i].value;
	}
	return selector;
}

function addCombinator( matcher, combinator, base ) {
	var dir = combinator.dir,
		checkNonElements = base && dir === "parentNode",
		doneName = done++;

	return combinator.first ?
		// Check against closest ancestor/preceding element
		function( elem, context, xml ) {
			while ( (elem = elem[ dir ]) ) {
				if ( elem.nodeType === 1 || checkNonElements ) {
					return matcher( elem, context, xml );
				}
			}
		} :

		// Check against all ancestor/preceding elements
		function( elem, context, xml ) {
			var oldCache, outerCache,
				newCache = [ dirruns, doneName ];

			// We can't set arbitrary data on XML nodes, so they don't benefit from dir caching
			if ( xml ) {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						if ( matcher( elem, context, xml ) ) {
							return true;
						}
					}
				}
			} else {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						outerCache = elem[ expando ] || (elem[ expando ] = {});
						if ( (oldCache = outerCache[ dir ]) &&
							oldCache[ 0 ] === dirruns && oldCache[ 1 ] === doneName ) {

							// Assign to newCache so results back-propagate to previous elements
							return (newCache[ 2 ] = oldCache[ 2 ]);
						} else {
							// Reuse newcache so results back-propagate to previous elements
							outerCache[ dir ] = newCache;

							// A match means we're done; a fail means we have to keep checking
							if ( (newCache[ 2 ] = matcher( elem, context, xml )) ) {
								return true;
							}
						}
					}
				}
			}
		};
}

function elementMatcher( matchers ) {
	return matchers.length > 1 ?
		function( elem, context, xml ) {
			var i = matchers.length;
			while ( i-- ) {
				if ( !matchers[i]( elem, context, xml ) ) {
					return false;
				}
			}
			return true;
		} :
		matchers[0];
}

function multipleContexts( selector, contexts, results ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		Sizzle( selector, contexts[i], results );
	}
	return results;
}

function condense( unmatched, map, filter, context, xml ) {
	var elem,
		newUnmatched = [],
		i = 0,
		len = unmatched.length,
		mapped = map != null;

	for ( ; i < len; i++ ) {
		if ( (elem = unmatched[i]) ) {
			if ( !filter || filter( elem, context, xml ) ) {
				newUnmatched.push( elem );
				if ( mapped ) {
					map.push( i );
				}
			}
		}
	}

	return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
	if ( postFilter && !postFilter[ expando ] ) {
		postFilter = setMatcher( postFilter );
	}
	if ( postFinder && !postFinder[ expando ] ) {
		postFinder = setMatcher( postFinder, postSelector );
	}
	return markFunction(function( seed, results, context, xml ) {
		var temp, i, elem,
			preMap = [],
			postMap = [],
			preexisting = results.length,

			// Get initial elements from seed or context
			elems = seed || multipleContexts( selector || "*", context.nodeType ? [ context ] : context, [] ),

			// Prefilter to get matcher input, preserving a map for seed-results synchronization
			matcherIn = preFilter && ( seed || !selector ) ?
				condense( elems, preMap, preFilter, context, xml ) :
				elems,

			matcherOut = matcher ?
				// If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
				postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

					// ...intermediate processing is necessary
					[] :

					// ...otherwise use results directly
					results :
				matcherIn;

		// Find primary matches
		if ( matcher ) {
			matcher( matcherIn, matcherOut, context, xml );
		}

		// Apply postFilter
		if ( postFilter ) {
			temp = condense( matcherOut, postMap );
			postFilter( temp, [], context, xml );

			// Un-match failing elements by moving them back to matcherIn
			i = temp.length;
			while ( i-- ) {
				if ( (elem = temp[i]) ) {
					matcherOut[ postMap[i] ] = !(matcherIn[ postMap[i] ] = elem);
				}
			}
		}

		if ( seed ) {
			if ( postFinder || preFilter ) {
				if ( postFinder ) {
					// Get the final matcherOut by condensing this intermediate into postFinder contexts
					temp = [];
					i = matcherOut.length;
					while ( i-- ) {
						if ( (elem = matcherOut[i]) ) {
							// Restore matcherIn since elem is not yet a final match
							temp.push( (matcherIn[i] = elem) );
						}
					}
					postFinder( null, (matcherOut = []), temp, xml );
				}

				// Move matched elements from seed to results to keep them synchronized
				i = matcherOut.length;
				while ( i-- ) {
					if ( (elem = matcherOut[i]) &&
						(temp = postFinder ? indexOf( seed, elem ) : preMap[i]) > -1 ) {

						seed[temp] = !(results[temp] = elem);
					}
				}
			}

		// Add elements to results, through postFinder if defined
		} else {
			matcherOut = condense(
				matcherOut === results ?
					matcherOut.splice( preexisting, matcherOut.length ) :
					matcherOut
			);
			if ( postFinder ) {
				postFinder( null, results, matcherOut, xml );
			} else {
				push.apply( results, matcherOut );
			}
		}
	});
}

function matcherFromTokens( tokens ) {
	var checkContext, matcher, j,
		len = tokens.length,
		leadingRelative = Expr.relative[ tokens[0].type ],
		implicitRelative = leadingRelative || Expr.relative[" "],
		i = leadingRelative ? 1 : 0,

		// The foundational matcher ensures that elements are reachable from top-level context(s)
		matchContext = addCombinator( function( elem ) {
			return elem === checkContext;
		}, implicitRelative, true ),
		matchAnyContext = addCombinator( function( elem ) {
			return indexOf( checkContext, elem ) > -1;
		}, implicitRelative, true ),
		matchers = [ function( elem, context, xml ) {
			var ret = ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
				(checkContext = context).nodeType ?
					matchContext( elem, context, xml ) :
					matchAnyContext( elem, context, xml ) );
			// Avoid hanging onto element (issue #299)
			checkContext = null;
			return ret;
		} ];

	for ( ; i < len; i++ ) {
		if ( (matcher = Expr.relative[ tokens[i].type ]) ) {
			matchers = [ addCombinator(elementMatcher( matchers ), matcher) ];
		} else {
			matcher = Expr.filter[ tokens[i].type ].apply( null, tokens[i].matches );

			// Return special upon seeing a positional matcher
			if ( matcher[ expando ] ) {
				// Find the next relative operator (if any) for proper handling
				j = ++i;
				for ( ; j < len; j++ ) {
					if ( Expr.relative[ tokens[j].type ] ) {
						break;
					}
				}
				return setMatcher(
					i > 1 && elementMatcher( matchers ),
					i > 1 && toSelector(
						// If the preceding token was a descendant combinator, insert an implicit any-element `*`
						tokens.slice( 0, i - 1 ).concat({ value: tokens[ i - 2 ].type === " " ? "*" : "" })
					).replace( rtrim, "$1" ),
					matcher,
					i < j && matcherFromTokens( tokens.slice( i, j ) ),
					j < len && matcherFromTokens( (tokens = tokens.slice( j )) ),
					j < len && toSelector( tokens )
				);
			}
			matchers.push( matcher );
		}
	}

	return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
	var bySet = setMatchers.length > 0,
		byElement = elementMatchers.length > 0,
		superMatcher = function( seed, context, xml, results, outermost ) {
			var elem, j, matcher,
				matchedCount = 0,
				i = "0",
				unmatched = seed && [],
				setMatched = [],
				contextBackup = outermostContext,
				// We must always have either seed elements or outermost context
				elems = seed || byElement && Expr.find["TAG"]( "*", outermost ),
				// Use integer dirruns iff this is the outermost matcher
				dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.random() || 0.1),
				len = elems.length;

			if ( outermost ) {
				outermostContext = context !== document && context;
			}

			// Add elements passing elementMatchers directly to results
			// Keep `i` a string if there are no elements so `matchedCount` will be "00" below
			// Support: IE<9, Safari
			// Tolerate NodeList properties (IE: "length"; Safari: <number>) matching elements by id
			for ( ; i !== len && (elem = elems[i]) != null; i++ ) {
				if ( byElement && elem ) {
					j = 0;
					while ( (matcher = elementMatchers[j++]) ) {
						if ( matcher( elem, context, xml ) ) {
							results.push( elem );
							break;
						}
					}
					if ( outermost ) {
						dirruns = dirrunsUnique;
					}
				}

				// Track unmatched elements for set filters
				if ( bySet ) {
					// They will have gone through all possible matchers
					if ( (elem = !matcher && elem) ) {
						matchedCount--;
					}

					// Lengthen the array for every element, matched or not
					if ( seed ) {
						unmatched.push( elem );
					}
				}
			}

			// Apply set filters to unmatched elements
			matchedCount += i;
			if ( bySet && i !== matchedCount ) {
				j = 0;
				while ( (matcher = setMatchers[j++]) ) {
					matcher( unmatched, setMatched, context, xml );
				}

				if ( seed ) {
					// Reintegrate element matches to eliminate the need for sorting
					if ( matchedCount > 0 ) {
						while ( i-- ) {
							if ( !(unmatched[i] || setMatched[i]) ) {
								setMatched[i] = pop.call( results );
							}
						}
					}

					// Discard index placeholder values to get only actual matches
					setMatched = condense( setMatched );
				}

				// Add matches to results
				push.apply( results, setMatched );

				// Seedless set matches succeeding multiple successful matchers stipulate sorting
				if ( outermost && !seed && setMatched.length > 0 &&
					( matchedCount + setMatchers.length ) > 1 ) {

					Sizzle.uniqueSort( results );
				}
			}

			// Override manipulation of globals by nested matchers
			if ( outermost ) {
				dirruns = dirrunsUnique;
				outermostContext = contextBackup;
			}

			return unmatched;
		};

	return bySet ?
		markFunction( superMatcher ) :
		superMatcher;
}

compile = Sizzle.compile = function( selector, match /* Internal Use Only */ ) {
	var i,
		setMatchers = [],
		elementMatchers = [],
		cached = compilerCache[ selector + " " ];

	if ( !cached ) {
		// Generate a function of recursive functions that can be used to check each element
		if ( !match ) {
			match = tokenize( selector );
		}
		i = match.length;
		while ( i-- ) {
			cached = matcherFromTokens( match[i] );
			if ( cached[ expando ] ) {
				setMatchers.push( cached );
			} else {
				elementMatchers.push( cached );
			}
		}

		// Cache the compiled function
		cached = compilerCache( selector, matcherFromGroupMatchers( elementMatchers, setMatchers ) );

		// Save selector and tokenization
		cached.selector = selector;
	}
	return cached;
};

/**
 * A low-level selection function that works with Sizzle's compiled
 *  selector functions
 * @param {String|Function} selector A selector or a pre-compiled
 *  selector function built with Sizzle.compile
 * @param {Element} context
 * @param {Array} [results]
 * @param {Array} [seed] A set of elements to match against
 */
select = Sizzle.select = function( selector, context, results, seed ) {
	var i, tokens, token, type, find,
		compiled = typeof selector === "function" && selector,
		match = !seed && tokenize( (selector = compiled.selector || selector) );

	results = results || [];

	// Try to minimize operations if there is no seed and only one group
	if ( match.length === 1 ) {

		// Take a shortcut and set the context if the root selector is an ID
		tokens = match[0] = match[0].slice( 0 );
		if ( tokens.length > 2 && (token = tokens[0]).type === "ID" &&
				support.getById && context.nodeType === 9 && documentIsHTML &&
				Expr.relative[ tokens[1].type ] ) {

			context = ( Expr.find["ID"]( token.matches[0].replace(runescape, funescape), context ) || [] )[0];
			if ( !context ) {
				return results;

			// Precompiled matchers will still verify ancestry, so step up a level
			} else if ( compiled ) {
				context = context.parentNode;
			}

			selector = selector.slice( tokens.shift().value.length );
		}

		// Fetch a seed set for right-to-left matching
		i = matchExpr["needsContext"].test( selector ) ? 0 : tokens.length;
		while ( i-- ) {
			token = tokens[i];

			// Abort if we hit a combinator
			if ( Expr.relative[ (type = token.type) ] ) {
				break;
			}
			if ( (find = Expr.find[ type ]) ) {
				// Search, expanding context for leading sibling combinators
				if ( (seed = find(
					token.matches[0].replace( runescape, funescape ),
					rsibling.test( tokens[0].type ) && testContext( context.parentNode ) || context
				)) ) {

					// If seed is empty or no tokens remain, we can return early
					tokens.splice( i, 1 );
					selector = seed.length && toSelector( tokens );
					if ( !selector ) {
						push.apply( results, seed );
						return results;
					}

					break;
				}
			}
		}
	}

	// Compile and execute a filtering function if one is not provided
	// Provide `match` to avoid retokenization if we modified the selector above
	( compiled || compile( selector, match ) )(
		seed,
		context,
		!documentIsHTML,
		results,
		rsibling.test( selector ) && testContext( context.parentNode ) || context
	);
	return results;
};

// One-time assignments

// Sort stability
support.sortStable = expando.split("").sort( sortOrder ).join("") === expando;

// Support: Chrome 14-35+
// Always assume duplicates if they aren't passed to the comparison function
support.detectDuplicates = !!hasDuplicate;

// Initialize against the default document
setDocument();

// Support: Webkit<537.32 - Safari 6.0.3/Chrome 25 (fixed in Chrome 27)
// Detached nodes confoundingly follow *each other*
support.sortDetached = assert(function( div1 ) {
	// Should return 1, but returns 4 (following)
	return div1.compareDocumentPosition( document.createElement("div") ) & 1;
});

// Support: IE<8
// Prevent attribute/property "interpolation"
// http://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !assert(function( div ) {
	div.innerHTML = "<a href='#'></a>";
	return div.firstChild.getAttribute("href") === "#" ;
}) ) {
	addHandle( "type|href|height|width", function( elem, name, isXML ) {
		if ( !isXML ) {
			return elem.getAttribute( name, name.toLowerCase() === "type" ? 1 : 2 );
		}
	});
}

// Support: IE<9
// Use defaultValue in place of getAttribute("value")
if ( !support.attributes || !assert(function( div ) {
	div.innerHTML = "<input/>";
	div.firstChild.setAttribute( "value", "" );
	return div.firstChild.getAttribute( "value" ) === "";
}) ) {
	addHandle( "value", function( elem, name, isXML ) {
		if ( !isXML && elem.nodeName.toLowerCase() === "input" ) {
			return elem.defaultValue;
		}
	});
}

// Support: IE<9
// Use getAttributeNode to fetch booleans when getAttribute lies
if ( !assert(function( div ) {
	return div.getAttribute("disabled") == null;
}) ) {
	addHandle( booleans, function( elem, name, isXML ) {
		var val;
		if ( !isXML ) {
			return elem[ name ] === true ? name.toLowerCase() :
					(val = elem.getAttributeNode( name )) && val.specified ?
					val.value :
				null;
		}
	});
}

return Sizzle;

})( window );



jQuery.find = Sizzle;
jQuery.expr = Sizzle.selectors;
jQuery.expr[":"] = jQuery.expr.pseudos;
jQuery.unique = Sizzle.uniqueSort;
jQuery.text = Sizzle.getText;
jQuery.isXMLDoc = Sizzle.isXML;
jQuery.contains = Sizzle.contains;



var rneedsContext = jQuery.expr.match.needsContext;

var rsingleTag = (/^<(\w+)\s*\/?>(?:<\/\1>|)$/);



var risSimple = /^.[^:#\[\.,]*$/;

// Implement the identical functionality for filter and not
function winnow( elements, qualifier, not ) {
	if ( jQuery.isFunction( qualifier ) ) {
		return jQuery.grep( elements, function( elem, i ) {
			/* jshint -W018 */
			return !!qualifier.call( elem, i, elem ) !== not;
		});

	}

	if ( qualifier.nodeType ) {
		return jQuery.grep( elements, function( elem ) {
			return ( elem === qualifier ) !== not;
		});

	}

	if ( typeof qualifier === "string" ) {
		if ( risSimple.test( qualifier ) ) {
			return jQuery.filter( qualifier, elements, not );
		}

		qualifier = jQuery.filter( qualifier, elements );
	}

	return jQuery.grep( elements, function( elem ) {
		return ( indexOf.call( qualifier, elem ) >= 0 ) !== not;
	});
}

jQuery.filter = function( expr, elems, not ) {
	var elem = elems[ 0 ];

	if ( not ) {
		expr = ":not(" + expr + ")";
	}

	return elems.length === 1 && elem.nodeType === 1 ?
		jQuery.find.matchesSelector( elem, expr ) ? [ elem ] : [] :
		jQuery.find.matches( expr, jQuery.grep( elems, function( elem ) {
			return elem.nodeType === 1;
		}));
};

jQuery.fn.extend({
	find: function( selector ) {
		var i,
			len = this.length,
			ret = [],
			self = this;

		if ( typeof selector !== "string" ) {
			return this.pushStack( jQuery( selector ).filter(function() {
				for ( i = 0; i < len; i++ ) {
					if ( jQuery.contains( self[ i ], this ) ) {
						return true;
					}
				}
			}) );
		}

		for ( i = 0; i < len; i++ ) {
			jQuery.find( selector, self[ i ], ret );
		}

		// Needed because $( selector, context ) becomes $( context ).find( selector )
		ret = this.pushStack( len > 1 ? jQuery.unique( ret ) : ret );
		ret.selector = this.selector ? this.selector + " " + selector : selector;
		return ret;
	},
	filter: function( selector ) {
		return this.pushStack( winnow(this, selector || [], false) );
	},
	not: function( selector ) {
		return this.pushStack( winnow(this, selector || [], true) );
	},
	is: function( selector ) {
		return !!winnow(
			this,

			// If this is a positional/relative selector, check membership in the returned set
			// so $("p:first").is("p:last") won't return true for a doc with two "p".
			typeof selector === "string" && rneedsContext.test( selector ) ?
				jQuery( selector ) :
				selector || [],
			false
		).length;
	}
});


// Initialize a jQuery object


// A central reference to the root jQuery(document)
var rootjQuery,

	// A simple way to check for HTML strings
	// Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
	// Strict HTML recognition (#11290: must start with <)
	rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,

	init = jQuery.fn.init = function( selector, context ) {
		var match, elem;

		// HANDLE: $(""), $(null), $(undefined), $(false)
		if ( !selector ) {
			return this;
		}

		// Handle HTML strings
		if ( typeof selector === "string" ) {
			if ( selector[0] === "<" && selector[ selector.length - 1 ] === ">" && selector.length >= 3 ) {
				// Assume that strings that start and end with <> are HTML and skip the regex check
				match = [ null, selector, null ];

			} else {
				match = rquickExpr.exec( selector );
			}

			// Match html or make sure no context is specified for #id
			if ( match && (match[1] || !context) ) {

				// HANDLE: $(html) -> $(array)
				if ( match[1] ) {
					context = context instanceof jQuery ? context[0] : context;

					// Option to run scripts is true for back-compat
					// Intentionally let the error be thrown if parseHTML is not present
					jQuery.merge( this, jQuery.parseHTML(
						match[1],
						context && context.nodeType ? context.ownerDocument || context : document,
						true
					) );

					// HANDLE: $(html, props)
					if ( rsingleTag.test( match[1] ) && jQuery.isPlainObject( context ) ) {
						for ( match in context ) {
							// Properties of context are called as methods if possible
							if ( jQuery.isFunction( this[ match ] ) ) {
								this[ match ]( context[ match ] );

							// ...and otherwise set as attributes
							} else {
								this.attr( match, context[ match ] );
							}
						}
					}

					return this;

				// HANDLE: $(#id)
				} else {
					elem = document.getElementById( match[2] );

					// Support: Blackberry 4.6
					// gEBID returns nodes no longer in the document (#6963)
					if ( elem && elem.parentNode ) {
						// Inject the element directly into the jQuery object
						this.length = 1;
						this[0] = elem;
					}

					this.context = document;
					this.selector = selector;
					return this;
				}

			// HANDLE: $(expr, $(...))
			} else if ( !context || context.jquery ) {
				return ( context || rootjQuery ).find( selector );

			// HANDLE: $(expr, context)
			// (which is just equivalent to: $(context).find(expr)
			} else {
				return this.constructor( context ).find( selector );
			}

		// HANDLE: $(DOMElement)
		} else if ( selector.nodeType ) {
			this.context = this[0] = selector;
			this.length = 1;
			return this;

		// HANDLE: $(function)
		// Shortcut for document ready
		} else if ( jQuery.isFunction( selector ) ) {
			return typeof rootjQuery.ready !== "undefined" ?
				rootjQuery.ready( selector ) :
				// Execute immediately if ready is not present
				selector( jQuery );
		}

		if ( selector.selector !== undefined ) {
			this.selector = selector.selector;
			this.context = selector.context;
		}

		return jQuery.makeArray( selector, this );
	};

// Give the init function the jQuery prototype for later instantiation
init.prototype = jQuery.fn;

// Initialize central reference
rootjQuery = jQuery( document );


var rparentsprev = /^(?:parents|prev(?:Until|All))/,
	// Methods guaranteed to produce a unique set when starting from a unique set
	guaranteedUnique = {
		children: true,
		contents: true,
		next: true,
		prev: true
	};

jQuery.extend({
	dir: function( elem, dir, until ) {
		var matched = [],
			truncate = until !== undefined;

		while ( (elem = elem[ dir ]) && elem.nodeType !== 9 ) {
			if ( elem.nodeType === 1 ) {
				if ( truncate && jQuery( elem ).is( until ) ) {
					break;
				}
				matched.push( elem );
			}
		}
		return matched;
	},

	sibling: function( n, elem ) {
		var matched = [];

		for ( ; n; n = n.nextSibling ) {
			if ( n.nodeType === 1 && n !== elem ) {
				matched.push( n );
			}
		}

		return matched;
	}
});

jQuery.fn.extend({
	has: function( target ) {
		var targets = jQuery( target, this ),
			l = targets.length;

		return this.filter(function() {
			var i = 0;
			for ( ; i < l; i++ ) {
				if ( jQuery.contains( this, targets[i] ) ) {
					return true;
				}
			}
		});
	},

	closest: function( selectors, context ) {
		var cur,
			i = 0,
			l = this.length,
			matched = [],
			pos = rneedsContext.test( selectors ) || typeof selectors !== "string" ?
				jQuery( selectors, context || this.context ) :
				0;

		for ( ; i < l; i++ ) {
			for ( cur = this[i]; cur && cur !== context; cur = cur.parentNode ) {
				// Always skip document fragments
				if ( cur.nodeType < 11 && (pos ?
					pos.index(cur) > -1 :

					// Don't pass non-elements to Sizzle
					cur.nodeType === 1 &&
						jQuery.find.matchesSelector(cur, selectors)) ) {

					matched.push( cur );
					break;
				}
			}
		}

		return this.pushStack( matched.length > 1 ? jQuery.unique( matched ) : matched );
	},

	// Determine the position of an element within the set
	index: function( elem ) {

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[ 0 ] && this[ 0 ].parentNode ) ? this.first().prevAll().length : -1;
		}

		// Index in selector
		if ( typeof elem === "string" ) {
			return indexOf.call( jQuery( elem ), this[ 0 ] );
		}

		// Locate the position of the desired element
		return indexOf.call( this,

			// If it receives a jQuery object, the first element is used
			elem.jquery ? elem[ 0 ] : elem
		);
	},

	add: function( selector, context ) {
		return this.pushStack(
			jQuery.unique(
				jQuery.merge( this.get(), jQuery( selector, context ) )
			)
		);
	},

	addBack: function( selector ) {
		return this.add( selector == null ?
			this.prevObject : this.prevObject.filter(selector)
		);
	}
});

function sibling( cur, dir ) {
	while ( (cur = cur[dir]) && cur.nodeType !== 1 ) {}
	return cur;
}

jQuery.each({
	parent: function( elem ) {
		var parent = elem.parentNode;
		return parent && parent.nodeType !== 11 ? parent : null;
	},
	parents: function( elem ) {
		return jQuery.dir( elem, "parentNode" );
	},
	parentsUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "parentNode", until );
	},
	next: function( elem ) {
		return sibling( elem, "nextSibling" );
	},
	prev: function( elem ) {
		return sibling( elem, "previousSibling" );
	},
	nextAll: function( elem ) {
		return jQuery.dir( elem, "nextSibling" );
	},
	prevAll: function( elem ) {
		return jQuery.dir( elem, "previousSibling" );
	},
	nextUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "nextSibling", until );
	},
	prevUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "previousSibling", until );
	},
	siblings: function( elem ) {
		return jQuery.sibling( ( elem.parentNode || {} ).firstChild, elem );
	},
	children: function( elem ) {
		return jQuery.sibling( elem.firstChild );
	},
	contents: function( elem ) {
		return elem.contentDocument || jQuery.merge( [], elem.childNodes );
	}
}, function( name, fn ) {
	jQuery.fn[ name ] = function( until, selector ) {
		var matched = jQuery.map( this, fn, until );

		if ( name.slice( -5 ) !== "Until" ) {
			selector = until;
		}

		if ( selector && typeof selector === "string" ) {
			matched = jQuery.filter( selector, matched );
		}

		if ( this.length > 1 ) {
			// Remove duplicates
			if ( !guaranteedUnique[ name ] ) {
				jQuery.unique( matched );
			}

			// Reverse order for parents* and prev-derivatives
			if ( rparentsprev.test( name ) ) {
				matched.reverse();
			}
		}

		return this.pushStack( matched );
	};
});
var rnotwhite = (/\S+/g);



// String to Object options format cache
var optionsCache = {};

// Convert String-formatted options into Object-formatted ones and store in cache
function createOptions( options ) {
	var object = optionsCache[ options ] = {};
	jQuery.each( options.match( rnotwhite ) || [], function( _, flag ) {
		object[ flag ] = true;
	});
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	options: an optional list of space-separated options that will change how
 *			the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

	// Convert options from String-formatted to Object-formatted if needed
	// (we check in cache first)
	options = typeof options === "string" ?
		( optionsCache[ options ] || createOptions( options ) ) :
		jQuery.extend( {}, options );

	var // Last fire value (for non-forgettable lists)
		memory,
		// Flag to know if list was already fired
		fired,
		// Flag to know if list is currently firing
		firing,
		// First callback to fire (used internally by add and fireWith)
		firingStart,
		// End of the loop when firing
		firingLength,
		// Index of currently firing callback (modified by remove if needed)
		firingIndex,
		// Actual callback list
		list = [],
		// Stack of fire calls for repeatable lists
		stack = !options.once && [],
		// Fire callbacks
		fire = function( data ) {
			memory = options.memory && data;
			fired = true;
			firingIndex = firingStart || 0;
			firingStart = 0;
			firingLength = list.length;
			firing = true;
			for ( ; list && firingIndex < firingLength; firingIndex++ ) {
				if ( list[ firingIndex ].apply( data[ 0 ], data[ 1 ] ) === false && options.stopOnFalse ) {
					memory = false; // To prevent further calls using add
					break;
				}
			}
			firing = false;
			if ( list ) {
				if ( stack ) {
					if ( stack.length ) {
						fire( stack.shift() );
					}
				} else if ( memory ) {
					list = [];
				} else {
					self.disable();
				}
			}
		},
		// Actual Callbacks object
		self = {
			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {
					// First, we save the current length
					var start = list.length;
					(function add( args ) {
						jQuery.each( args, function( _, arg ) {
							var type = jQuery.type( arg );
							if ( type === "function" ) {
								if ( !options.unique || !self.has( arg ) ) {
									list.push( arg );
								}
							} else if ( arg && arg.length && type !== "string" ) {
								// Inspect recursively
								add( arg );
							}
						});
					})( arguments );
					// Do we need to add the callbacks to the
					// current firing batch?
					if ( firing ) {
						firingLength = list.length;
					// With memory, if we're not firing then
					// we should call right away
					} else if ( memory ) {
						firingStart = start;
						fire( memory );
					}
				}
				return this;
			},
			// Remove a callback from the list
			remove: function() {
				if ( list ) {
					jQuery.each( arguments, function( _, arg ) {
						var index;
						while ( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
							list.splice( index, 1 );
							// Handle firing indexes
							if ( firing ) {
								if ( index <= firingLength ) {
									firingLength--;
								}
								if ( index <= firingIndex ) {
									firingIndex--;
								}
							}
						}
					});
				}
				return this;
			},
			// Check if a given callback is in the list.
			// If no argument is given, return whether or not list has callbacks attached.
			has: function( fn ) {
				return fn ? jQuery.inArray( fn, list ) > -1 : !!( list && list.length );
			},
			// Remove all callbacks from the list
			empty: function() {
				list = [];
				firingLength = 0;
				return this;
			},
			// Have the list do nothing anymore
			disable: function() {
				list = stack = memory = undefined;
				return this;
			},
			// Is it disabled?
			disabled: function() {
				return !list;
			},
			// Lock the list in its current state
			lock: function() {
				stack = undefined;
				if ( !memory ) {
					self.disable();
				}
				return this;
			},
			// Is it locked?
			locked: function() {
				return !stack;
			},
			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				if ( list && ( !fired || stack ) ) {
					args = args || [];
					args = [ context, args.slice ? args.slice() : args ];
					if ( firing ) {
						stack.push( args );
					} else {
						fire( args );
					}
				}
				return this;
			},
			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},
			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};


jQuery.extend({

	Deferred: function( func ) {
		var tuples = [
				// action, add listener, listener list, final state
				[ "resolve", "done", jQuery.Callbacks("once memory"), "resolved" ],
				[ "reject", "fail", jQuery.Callbacks("once memory"), "rejected" ],
				[ "notify", "progress", jQuery.Callbacks("memory") ]
			],
			state = "pending",
			promise = {
				state: function() {
					return state;
				},
				always: function() {
					deferred.done( arguments ).fail( arguments );
					return this;
				},
				then: function( /* fnDone, fnFail, fnProgress */ ) {
					var fns = arguments;
					return jQuery.Deferred(function( newDefer ) {
						jQuery.each( tuples, function( i, tuple ) {
							var fn = jQuery.isFunction( fns[ i ] ) && fns[ i ];
							// deferred[ done | fail | progress ] for forwarding actions to newDefer
							deferred[ tuple[1] ](function() {
								var returned = fn && fn.apply( this, arguments );
								if ( returned && jQuery.isFunction( returned.promise ) ) {
									returned.promise()
										.done( newDefer.resolve )
										.fail( newDefer.reject )
										.progress( newDefer.notify );
								} else {
									newDefer[ tuple[ 0 ] + "With" ]( this === promise ? newDefer.promise() : this, fn ? [ returned ] : arguments );
								}
							});
						});
						fns = null;
					}).promise();
				},
				// Get a promise for this deferred
				// If obj is provided, the promise aspect is added to the object
				promise: function( obj ) {
					return obj != null ? jQuery.extend( obj, promise ) : promise;
				}
			},
			deferred = {};

		// Keep pipe for back-compat
		promise.pipe = promise.then;

		// Add list-specific methods
		jQuery.each( tuples, function( i, tuple ) {
			var list = tuple[ 2 ],
				stateString = tuple[ 3 ];

			// promise[ done | fail | progress ] = list.add
			promise[ tuple[1] ] = list.add;

			// Handle state
			if ( stateString ) {
				list.add(function() {
					// state = [ resolved | rejected ]
					state = stateString;

				// [ reject_list | resolve_list ].disable; progress_list.lock
				}, tuples[ i ^ 1 ][ 2 ].disable, tuples[ 2 ][ 2 ].lock );
			}

			// deferred[ resolve | reject | notify ]
			deferred[ tuple[0] ] = function() {
				deferred[ tuple[0] + "With" ]( this === deferred ? promise : this, arguments );
				return this;
			};
			deferred[ tuple[0] + "With" ] = list.fireWith;
		});

		// Make the deferred a promise
		promise.promise( deferred );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( subordinate /* , ..., subordinateN */ ) {
		var i = 0,
			resolveValues = slice.call( arguments ),
			length = resolveValues.length,

			// the count of uncompleted subordinates
			remaining = length !== 1 || ( subordinate && jQuery.isFunction( subordinate.promise ) ) ? length : 0,

			// the master Deferred. If resolveValues consist of only a single Deferred, just use that.
			deferred = remaining === 1 ? subordinate : jQuery.Deferred(),

			// Update function for both resolve and progress values
			updateFunc = function( i, contexts, values ) {
				return function( value ) {
					contexts[ i ] = this;
					values[ i ] = arguments.length > 1 ? slice.call( arguments ) : value;
					if ( values === progressValues ) {
						deferred.notifyWith( contexts, values );
					} else if ( !( --remaining ) ) {
						deferred.resolveWith( contexts, values );
					}
				};
			},

			progressValues, progressContexts, resolveContexts;

		// Add listeners to Deferred subordinates; treat others as resolved
		if ( length > 1 ) {
			progressValues = new Array( length );
			progressContexts = new Array( length );
			resolveContexts = new Array( length );
			for ( ; i < length; i++ ) {
				if ( resolveValues[ i ] && jQuery.isFunction( resolveValues[ i ].promise ) ) {
					resolveValues[ i ].promise()
						.done( updateFunc( i, resolveContexts, resolveValues ) )
						.fail( deferred.reject )
						.progress( updateFunc( i, progressContexts, progressValues ) );
				} else {
					--remaining;
				}
			}
		}

		// If we're not waiting on anything, resolve the master
		if ( !remaining ) {
			deferred.resolveWith( resolveContexts, resolveValues );
		}

		return deferred.promise();
	}
});


// The deferred used on DOM ready
var readyList;

jQuery.fn.ready = function( fn ) {
	// Add the callback
	jQuery.ready.promise().done( fn );

	return this;
};

jQuery.extend({
	// Is the DOM ready to be used? Set to true once it occurs.
	isReady: false,

	// A counter to track how many items to wait for before
	// the ready event fires. See #6781
	readyWait: 1,

	// Hold (or release) the ready event
	holdReady: function( hold ) {
		if ( hold ) {
			jQuery.readyWait++;
		} else {
			jQuery.ready( true );
		}
	},

	// Handle when the DOM is ready
	ready: function( wait ) {

		// Abort if there are pending holds or we're already ready
		if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
			return;
		}

		// Remember that the DOM is ready
		jQuery.isReady = true;

		// If a normal DOM Ready event fired, decrement, and wait if need be
		if ( wait !== true && --jQuery.readyWait > 0 ) {
			return;
		}

		// If there are functions bound, to execute
		readyList.resolveWith( document, [ jQuery ] );

		// Trigger any bound ready events
		if ( jQuery.fn.triggerHandler ) {
			jQuery( document ).triggerHandler( "ready" );
			jQuery( document ).off( "ready" );
		}
	}
});

/**
 * The ready event handler and self cleanup method
 */
function completed() {
	document.removeEventListener( "DOMContentLoaded", completed, false );
	window.removeEventListener( "load", completed, false );
	jQuery.ready();
}

jQuery.ready.promise = function( obj ) {
	if ( !readyList ) {

		readyList = jQuery.Deferred();

		// Catch cases where $(document).ready() is called after the browser event has already occurred.
		// We once tried to use readyState "interactive" here, but it caused issues like the one
		// discovered by ChrisS here: http://bugs.jquery.com/ticket/12282#comment:15
		if ( document.readyState === "complete" ) {
			// Handle it asynchronously to allow scripts the opportunity to delay ready
			setTimeout( jQuery.ready );

		} else {

			// Use the handy event callback
			document.addEventListener( "DOMContentLoaded", completed, false );

			// A fallback to window.onload, that will always work
			window.addEventListener( "load", completed, false );
		}
	}
	return readyList.promise( obj );
};

// Kick off the DOM ready check even if the user does not
jQuery.ready.promise();




// Multifunctional method to get and set values of a collection
// The value/s can optionally be executed if it's a function
var access = jQuery.access = function( elems, fn, key, value, chainable, emptyGet, raw ) {
	var i = 0,
		len = elems.length,
		bulk = key == null;

	// Sets many values
	if ( jQuery.type( key ) === "object" ) {
		chainable = true;
		for ( i in key ) {
			jQuery.access( elems, fn, i, key[i], true, emptyGet, raw );
		}

	// Sets one value
	} else if ( value !== undefined ) {
		chainable = true;

		if ( !jQuery.isFunction( value ) ) {
			raw = true;
		}

		if ( bulk ) {
			// Bulk operations run against the entire set
			if ( raw ) {
				fn.call( elems, value );
				fn = null;

			// ...except when executing function values
			} else {
				bulk = fn;
				fn = function( elem, key, value ) {
					return bulk.call( jQuery( elem ), value );
				};
			}
		}

		if ( fn ) {
			for ( ; i < len; i++ ) {
				fn( elems[i], key, raw ? value : value.call( elems[i], i, fn( elems[i], key ) ) );
			}
		}
	}

	return chainable ?
		elems :

		// Gets
		bulk ?
			fn.call( elems ) :
			len ? fn( elems[0], key ) : emptyGet;
};


/**
 * Determines whether an object can have data
 */
jQuery.acceptData = function( owner ) {
	// Accepts only:
	//  - Node
	//    - Node.ELEMENT_NODE
	//    - Node.DOCUMENT_NODE
	//  - Object
	//    - Any
	/* jshint -W018 */
	return owner.nodeType === 1 || owner.nodeType === 9 || !( +owner.nodeType );
};


function Data() {
	// Support: Android<4,
	// Old WebKit does not have Object.preventExtensions/freeze method,
	// return new empty object instead with no [[set]] accessor
	Object.defineProperty( this.cache = {}, 0, {
		get: function() {
			return {};
		}
	});

	this.expando = jQuery.expando + Data.uid++;
}

Data.uid = 1;
Data.accepts = jQuery.acceptData;

Data.prototype = {
	key: function( owner ) {
		// We can accept data for non-element nodes in modern browsers,
		// but we should not, see #8335.
		// Always return the key for a frozen object.
		if ( !Data.accepts( owner ) ) {
			return 0;
		}

		var descriptor = {},
			// Check if the owner object already has a cache key
			unlock = owner[ this.expando ];

		// If not, create one
		if ( !unlock ) {
			unlock = Data.uid++;

			// Secure it in a non-enumerable, non-writable property
			try {
				descriptor[ this.expando ] = { value: unlock };
				Object.defineProperties( owner, descriptor );

			// Support: Android<4
			// Fallback to a less secure definition
			} catch ( e ) {
				descriptor[ this.expando ] = unlock;
				jQuery.extend( owner, descriptor );
			}
		}

		// Ensure the cache object
		if ( !this.cache[ unlock ] ) {
			this.cache[ unlock ] = {};
		}

		return unlock;
	},
	set: function( owner, data, value ) {
		var prop,
			// There may be an unlock assigned to this node,
			// if there is no entry for this "owner", create one inline
			// and set the unlock as though an owner entry had always existed
			unlock = this.key( owner ),
			cache = this.cache[ unlock ];

		// Handle: [ owner, key, value ] args
		if ( typeof data === "string" ) {
			cache[ data ] = value;

		// Handle: [ owner, { properties } ] args
		} else {
			// Fresh assignments by object are shallow copied
			if ( jQuery.isEmptyObject( cache ) ) {
				jQuery.extend( this.cache[ unlock ], data );
			// Otherwise, copy the properties one-by-one to the cache object
			} else {
				for ( prop in data ) {
					cache[ prop ] = data[ prop ];
				}
			}
		}
		return cache;
	},
	get: function( owner, key ) {
		// Either a valid cache is found, or will be created.
		// New caches will be created and the unlock returned,
		// allowing direct access to the newly created
		// empty data object. A valid owner object must be provided.
		var cache = this.cache[ this.key( owner ) ];

		return key === undefined ?
			cache : cache[ key ];
	},
	access: function( owner, key, value ) {
		var stored;
		// In cases where either:
		//
		//   1. No key was specified
		//   2. A string key was specified, but no value provided
		//
		// Take the "read" path and allow the get method to determine
		// which value to return, respectively either:
		//
		//   1. The entire cache object
		//   2. The data stored at the key
		//
		if ( key === undefined ||
				((key && typeof key === "string") && value === undefined) ) {

			stored = this.get( owner, key );

			return stored !== undefined ?
				stored : this.get( owner, jQuery.camelCase(key) );
		}

		// [*]When the key is not a string, or both a key and value
		// are specified, set or extend (existing objects) with either:
		//
		//   1. An object of properties
		//   2. A key and value
		//
		this.set( owner, key, value );

		// Since the "set" path can have two possible entry points
		// return the expected data based on which path was taken[*]
		return value !== undefined ? value : key;
	},
	remove: function( owner, key ) {
		var i, name, camel,
			unlock = this.key( owner ),
			cache = this.cache[ unlock ];

		if ( key === undefined ) {
			this.cache[ unlock ] = {};

		} else {
			// Support array or space separated string of keys
			if ( jQuery.isArray( key ) ) {
				// If "name" is an array of keys...
				// When data is initially created, via ("key", "val") signature,
				// keys will be converted to camelCase.
				// Since there is no way to tell _how_ a key was added, remove
				// both plain key and camelCase key. #12786
				// This will only penalize the array argument path.
				name = key.concat( key.map( jQuery.camelCase ) );
			} else {
				camel = jQuery.camelCase( key );
				// Try the string as a key before any manipulation
				if ( key in cache ) {
					name = [ key, camel ];
				} else {
					// If a key with the spaces exists, use it.
					// Otherwise, create an array by matching non-whitespace
					name = camel;
					name = name in cache ?
						[ name ] : ( name.match( rnotwhite ) || [] );
				}
			}

			i = name.length;
			while ( i-- ) {
				delete cache[ name[ i ] ];
			}
		}
	},
	hasData: function( owner ) {
		return !jQuery.isEmptyObject(
			this.cache[ owner[ this.expando ] ] || {}
		);
	},
	discard: function( owner ) {
		if ( owner[ this.expando ] ) {
			delete this.cache[ owner[ this.expando ] ];
		}
	}
};
var data_priv = new Data();

var data_user = new Data();



//	Implementation Summary
//
//	1. Enforce API surface and semantic compatibility with 1.9.x branch
//	2. Improve the module's maintainability by reducing the storage
//		paths to a single mechanism.
//	3. Use the same single mechanism to support "private" and "user" data.
//	4. _Never_ expose "private" data to user code (TODO: Drop _data, _removeData)
//	5. Avoid exposing implementation details on user objects (eg. expando properties)
//	6. Provide a clear path for implementation upgrade to WeakMap in 2014

var rbrace = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
	rmultiDash = /([A-Z])/g;

function dataAttr( elem, key, data ) {
	var name;

	// If nothing was found internally, try to fetch any
	// data from the HTML5 data-* attribute
	if ( data === undefined && elem.nodeType === 1 ) {
		name = "data-" + key.replace( rmultiDash, "-$1" ).toLowerCase();
		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = data === "true" ? true :
					data === "false" ? false :
					data === "null" ? null :
					// Only convert to a number if it doesn't change the string
					+data + "" === data ? +data :
					rbrace.test( data ) ? jQuery.parseJSON( data ) :
					data;
			} catch( e ) {}

			// Make sure we set the data so it isn't changed later
			data_user.set( elem, key, data );
		} else {
			data = undefined;
		}
	}
	return data;
}

jQuery.extend({
	hasData: function( elem ) {
		return data_user.hasData( elem ) || data_priv.hasData( elem );
	},

	data: function( elem, name, data ) {
		return data_user.access( elem, name, data );
	},

	removeData: function( elem, name ) {
		data_user.remove( elem, name );
	},

	// TODO: Now that all calls to _data and _removeData have been replaced
	// with direct calls to data_priv methods, these can be deprecated.
	_data: function( elem, name, data ) {
		return data_priv.access( elem, name, data );
	},

	_removeData: function( elem, name ) {
		data_priv.remove( elem, name );
	}
});

jQuery.fn.extend({
	data: function( key, value ) {
		var i, name, data,
			elem = this[ 0 ],
			attrs = elem && elem.attributes;

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = data_user.get( elem );

				if ( elem.nodeType === 1 && !data_priv.get( elem, "hasDataAttrs" ) ) {
					i = attrs.length;
					while ( i-- ) {

						// Support: IE11+
						// The attrs elements can be null (#14894)
						if ( attrs[ i ] ) {
							name = attrs[ i ].name;
							if ( name.indexOf( "data-" ) === 0 ) {
								name = jQuery.camelCase( name.slice(5) );
								dataAttr( elem, name, data[ name ] );
							}
						}
					}
					data_priv.set( elem, "hasDataAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each(function() {
				data_user.set( this, key );
			});
		}

		return access( this, function( value ) {
			var data,
				camelKey = jQuery.camelCase( key );

			// The calling jQuery object (element matches) is not empty
			// (and therefore has an element appears at this[ 0 ]) and the
			// `value` parameter was not undefined. An empty jQuery object
			// will result in `undefined` for elem = this[ 0 ] which will
			// throw an exception if an attempt to read a data cache is made.
			if ( elem && value === undefined ) {
				// Attempt to get data from the cache
				// with the key as-is
				data = data_user.get( elem, key );
				if ( data !== undefined ) {
					return data;
				}

				// Attempt to get data from the cache
				// with the key camelized
				data = data_user.get( elem, camelKey );
				if ( data !== undefined ) {
					return data;
				}

				// Attempt to "discover" the data in
				// HTML5 custom data-* attrs
				data = dataAttr( elem, camelKey, undefined );
				if ( data !== undefined ) {
					return data;
				}

				// We tried really hard, but the data doesn't exist.
				return;
			}

			// Set the data...
			this.each(function() {
				// First, attempt to store a copy or reference of any
				// data that might've been store with a camelCased key.
				var data = data_user.get( this, camelKey );

				// For HTML5 data-* attribute interop, we have to
				// store property names with dashes in a camelCase form.
				// This might not apply to all properties...*
				data_user.set( this, camelKey, value );

				// *... In the case of properties that might _actually_
				// have dashes, we need to also store a copy of that
				// unchanged property.
				if ( key.indexOf("-") !== -1 && data !== undefined ) {
					data_user.set( this, key, value );
				}
			});
		}, null, value, arguments.length > 1, null, true );
	},

	removeData: function( key ) {
		return this.each(function() {
			data_user.remove( this, key );
		});
	}
});


jQuery.extend({
	queue: function( elem, type, data ) {
		var queue;

		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			queue = data_priv.get( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !queue || jQuery.isArray( data ) ) {
					queue = data_priv.access( elem, type, jQuery.makeArray(data) );
				} else {
					queue.push( data );
				}
			}
			return queue || [];
		}
	},

	dequeue: function( elem, type ) {
		type = type || "fx";

		var queue = jQuery.queue( elem, type ),
			startLength = queue.length,
			fn = queue.shift(),
			hooks = jQuery._queueHooks( elem, type ),
			next = function() {
				jQuery.dequeue( elem, type );
			};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
			startLength--;
		}

		if ( fn ) {

			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			// Clear up the last queue stop function
			delete hooks.stop;
			fn.call( elem, next, hooks );
		}

		if ( !startLength && hooks ) {
			hooks.empty.fire();
		}
	},

	// Not public - generate a queueHooks object, or return the current one
	_queueHooks: function( elem, type ) {
		var key = type + "queueHooks";
		return data_priv.get( elem, key ) || data_priv.access( elem, key, {
			empty: jQuery.Callbacks("once memory").add(function() {
				data_priv.remove( elem, [ type + "queue", key ] );
			})
		});
	}
});

jQuery.fn.extend({
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[0], type );
		}

		return data === undefined ?
			this :
			this.each(function() {
				var queue = jQuery.queue( this, type, data );

				// Ensure a hooks for this queue
				jQuery._queueHooks( this, type );

				if ( type === "fx" && queue[0] !== "inprogress" ) {
					jQuery.dequeue( this, type );
				}
			});
	},
	dequeue: function( type ) {
		return this.each(function() {
			jQuery.dequeue( this, type );
		});
	},
	clearQueue: function( type ) {
		return this.queue( type || "fx", [] );
	},
	// Get a promise resolved when queues of a certain type
	// are emptied (fx is the type by default)
	promise: function( type, obj ) {
		var tmp,
			count = 1,
			defer = jQuery.Deferred(),
			elements = this,
			i = this.length,
			resolve = function() {
				if ( !( --count ) ) {
					defer.resolveWith( elements, [ elements ] );
				}
			};

		if ( typeof type !== "string" ) {
			obj = type;
			type = undefined;
		}
		type = type || "fx";

		while ( i-- ) {
			tmp = data_priv.get( elements[ i ], type + "queueHooks" );
			if ( tmp && tmp.empty ) {
				count++;
				tmp.empty.add( resolve );
			}
		}
		resolve();
		return defer.promise( obj );
	}
});
var pnum = (/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/).source;

var cssExpand = [ "Top", "Right", "Bottom", "Left" ];

var isHidden = function( elem, el ) {
		// isHidden might be called from jQuery#filter function;
		// in that case, element will be second argument
		elem = el || elem;
		return jQuery.css( elem, "display" ) === "none" || !jQuery.contains( elem.ownerDocument, elem );
	};

var rcheckableType = (/^(?:checkbox|radio)$/i);



(function() {
	var fragment = document.createDocumentFragment(),
		div = fragment.appendChild( document.createElement( "div" ) ),
		input = document.createElement( "input" );

	// Support: Safari<=5.1
	// Check state lost if the name is set (#11217)
	// Support: Windows Web Apps (WWA)
	// `name` and `type` must use .setAttribute for WWA (#14901)
	input.setAttribute( "type", "radio" );
	input.setAttribute( "checked", "checked" );
	input.setAttribute( "name", "t" );

	div.appendChild( input );

	// Support: Safari<=5.1, Android<4.2
	// Older WebKit doesn't clone checked state correctly in fragments
	support.checkClone = div.cloneNode( true ).cloneNode( true ).lastChild.checked;

	// Support: IE<=11+
	// Make sure textarea (and checkbox) defaultValue is properly cloned
	div.innerHTML = "<textarea>x</textarea>";
	support.noCloneChecked = !!div.cloneNode( true ).lastChild.defaultValue;
})();
var strundefined = typeof undefined;



support.focusinBubbles = "onfocusin" in window;


var
	rkeyEvent = /^key/,
	rmouseEvent = /^(?:mouse|pointer|contextmenu)|click/,
	rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	rtypenamespace = /^([^.]*)(?:\.(.+)|)$/;

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

function safeActiveElement() {
	try {
		return document.activeElement;
	} catch ( err ) { }
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	global: {},

	add: function( elem, types, handler, data, selector ) {

		var handleObjIn, eventHandle, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = data_priv.get( elem );

		// Don't attach events to noData or text/comment nodes (but allow plain objects)
		if ( !elemData ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		if ( !(events = elemData.events) ) {
			events = elemData.events = {};
		}
		if ( !(eventHandle = elemData.handle) ) {
			eventHandle = elemData.handle = function( e ) {
				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== strundefined && jQuery.event.triggered !== e.type ?
					jQuery.event.dispatch.apply( elem, arguments ) : undefined;
			};
		}

		// Handle multiple events separated by a space
		types = ( types || "" ).match( rnotwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// There *must* be a type, no attaching namespace-only handlers
			if ( !type ) {
				continue;
			}

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend({
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join(".")
			}, handleObjIn );

			// Init the event handler queue if we're the first
			if ( !(handlers = events[ type ]) ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener if the special events handler returns false
				if ( !special.setup || special.setup.call( elem, data, namespaces, eventHandle ) === false ) {
					if ( elem.addEventListener ) {
						elem.addEventListener( type, eventHandle, false );
					}
				}
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// Keep track of which events have ever been used, for event optimization
			jQuery.event.global[ type ] = true;
		}

	},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {

		var j, origCount, tmp,
			events, t, handleObj,
			special, handlers, type, namespaces, origType,
			elemData = data_priv.hasData( elem ) && data_priv.get( elem );

		if ( !elemData || !(events = elemData.events) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = ( types || "" ).match( rnotwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector ? special.delegateType : special.bindType ) || type;
			handlers = events[ type ] || [];
			tmp = tmp[2] && new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" );

			// Remove matching events
			origCount = j = handlers.length;
			while ( j-- ) {
				handleObj = handlers[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector || selector === "**" && handleObj.selector ) ) {
					handlers.splice( j, 1 );

					if ( handleObj.selector ) {
						handlers.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( origCount && !handlers.length ) {
				if ( !special.teardown || special.teardown.call( elem, namespaces, elemData.handle ) === false ) {
					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			delete elemData.handle;
			data_priv.remove( elem, "events" );
		}
	},

	trigger: function( event, data, elem, onlyHandlers ) {

		var i, cur, tmp, bubbleType, ontype, handle, special,
			eventPath = [ elem || document ],
			type = hasOwn.call( event, "type" ) ? event.type : event,
			namespaces = hasOwn.call( event, "namespace" ) ? event.namespace.split(".") : [];

		cur = tmp = elem = elem || document;

		// Don't do events on text and comment nodes
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf(".") >= 0 ) {
			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split(".");
			type = namespaces.shift();
			namespaces.sort();
		}
		ontype = type.indexOf(":") < 0 && "on" + type;

		// Caller can pass in a jQuery.Event object, Object, or just an event type string
		event = event[ jQuery.expando ] ?
			event :
			new jQuery.Event( type, typeof event === "object" && event );

		// Trigger bitmask: & 1 for native handlers; & 2 for jQuery (always true)
		event.isTrigger = onlyHandlers ? 2 : 3;
		event.namespace = namespaces.join(".");
		event.namespace_re = event.namespace ?
			new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" ) :
			null;

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data == null ?
			[ event ] :
			jQuery.makeArray( data, [ event ] );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (#9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
		if ( !onlyHandlers && !special.noBubble && !jQuery.isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			if ( !rfocusMorph.test( bubbleType + type ) ) {
				cur = cur.parentNode;
			}
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push( cur );
				tmp = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( tmp === (elem.ownerDocument || document) ) {
				eventPath.push( tmp.defaultView || tmp.parentWindow || window );
			}
		}

		// Fire handlers on the event path
		i = 0;
		while ( (cur = eventPath[i++]) && !event.isPropagationStopped() ) {

			event.type = i > 1 ?
				bubbleType :
				special.bindType || type;

			// jQuery handler
			handle = ( data_priv.get( cur, "events" ) || {} )[ event.type ] && data_priv.get( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}

			// Native handler
			handle = ontype && cur[ ontype ];
			if ( handle && handle.apply && jQuery.acceptData( cur ) ) {
				event.result = handle.apply( cur, data );
				if ( event.result === false ) {
					event.preventDefault();
				}
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( (!special._default || special._default.apply( eventPath.pop(), data ) === false) &&
				jQuery.acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name name as the event.
				// Don't do default actions on window, that's where global variables be (#6170)
				if ( ontype && jQuery.isFunction( elem[ type ] ) && !jQuery.isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					tmp = elem[ ontype ];

					if ( tmp ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;
					elem[ type ]();
					jQuery.event.triggered = undefined;

					if ( tmp ) {
						elem[ ontype ] = tmp;
					}
				}
			}
		}

		return event.result;
	},

	dispatch: function( event ) {

		// Make a writable jQuery.Event from the native event object
		event = jQuery.event.fix( event );

		var i, j, ret, matched, handleObj,
			handlerQueue = [],
			args = slice.call( arguments ),
			handlers = ( data_priv.get( this, "events" ) || {} )[ event.type ] || [],
			special = jQuery.event.special[ event.type ] || {};

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[0] = event;
		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers
		handlerQueue = jQuery.event.handlers.call( this, event, handlers );

		// Run delegates first; they may want to stop propagation beneath us
		i = 0;
		while ( (matched = handlerQueue[ i++ ]) && !event.isPropagationStopped() ) {
			event.currentTarget = matched.elem;

			j = 0;
			while ( (handleObj = matched.handlers[ j++ ]) && !event.isImmediatePropagationStopped() ) {

				// Triggered event must either 1) have no namespace, or 2) have namespace(s)
				// a subset or equal to those in the bound event (both can have no namespace).
				if ( !event.namespace_re || event.namespace_re.test( handleObj.namespace ) ) {

					event.handleObj = handleObj;
					event.data = handleObj.data;

					ret = ( (jQuery.event.special[ handleObj.origType ] || {}).handle || handleObj.handler )
							.apply( matched.elem, args );

					if ( ret !== undefined ) {
						if ( (event.result = ret) === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	handlers: function( event, handlers ) {
		var i, matches, sel, handleObj,
			handlerQueue = [],
			delegateCount = handlers.delegateCount,
			cur = event.target;

		// Find delegate handlers
		// Black-hole SVG <use> instance trees (#13180)
		// Avoid non-left-click bubbling in Firefox (#3861)
		if ( delegateCount && cur.nodeType && (!event.button || event.type !== "click") ) {

			for ( ; cur !== this; cur = cur.parentNode || this ) {

				// Don't process clicks on disabled elements (#6911, #8165, #11382, #11764)
				if ( cur.disabled !== true || event.type !== "click" ) {
					matches = [];
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];

						// Don't conflict with Object.prototype properties (#13203)
						sel = handleObj.selector + " ";

						if ( matches[ sel ] === undefined ) {
							matches[ sel ] = handleObj.needsContext ?
								jQuery( sel, this ).index( cur ) >= 0 :
								jQuery.find( sel, this, null, [ cur ] ).length;
						}
						if ( matches[ sel ] ) {
							matches.push( handleObj );
						}
					}
					if ( matches.length ) {
						handlerQueue.push({ elem: cur, handlers: matches });
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		if ( delegateCount < handlers.length ) {
			handlerQueue.push({ elem: this, handlers: handlers.slice( delegateCount ) });
		}

		return handlerQueue;
	},

	// Includes some event props shared by KeyEvent and MouseEvent
	props: "altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),

	fixHooks: {},

	keyHooks: {
		props: "char charCode key keyCode".split(" "),
		filter: function( event, original ) {

			// Add which for key events
			if ( event.which == null ) {
				event.which = original.charCode != null ? original.charCode : original.keyCode;
			}

			return event;
		}
	},

	mouseHooks: {
		props: "button buttons clientX clientY offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
		filter: function( event, original ) {
			var eventDoc, doc, body,
				button = original.button;

			// Calculate pageX/Y if missing and clientX/Y available
			if ( event.pageX == null && original.clientX != null ) {
				eventDoc = event.target.ownerDocument || document;
				doc = eventDoc.documentElement;
				body = eventDoc.body;

				event.pageX = original.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) - ( doc && doc.clientLeft || body && body.clientLeft || 0 );
				event.pageY = original.clientY + ( doc && doc.scrollTop  || body && body.scrollTop  || 0 ) - ( doc && doc.clientTop  || body && body.clientTop  || 0 );
			}

			// Add which for click: 1 === left; 2 === middle; 3 === right
			// Note: button is not normalized, so don't use it
			if ( !event.which && button !== undefined ) {
				event.which = ( button & 1 ? 1 : ( button & 2 ? 3 : ( button & 4 ? 2 : 0 ) ) );
			}

			return event;
		}
	},

	fix: function( event ) {
		if ( event[ jQuery.expando ] ) {
			return event;
		}

		// Create a writable copy of the event object and normalize some properties
		var i, prop, copy,
			type = event.type,
			originalEvent = event,
			fixHook = this.fixHooks[ type ];

		if ( !fixHook ) {
			this.fixHooks[ type ] = fixHook =
				rmouseEvent.test( type ) ? this.mouseHooks :
				rkeyEvent.test( type ) ? this.keyHooks :
				{};
		}
		copy = fixHook.props ? this.props.concat( fixHook.props ) : this.props;

		event = new jQuery.Event( originalEvent );

		i = copy.length;
		while ( i-- ) {
			prop = copy[ i ];
			event[ prop ] = originalEvent[ prop ];
		}

		// Support: Cordova 2.5 (WebKit) (#13255)
		// All events should have a target; Cordova deviceready doesn't
		if ( !event.target ) {
			event.target = document;
		}

		// Support: Safari 6.0+, Chrome<28
		// Target should not be a text node (#504, #13143)
		if ( event.target.nodeType === 3 ) {
			event.target = event.target.parentNode;
		}

		return fixHook.filter ? fixHook.filter( event, originalEvent ) : event;
	},

	special: {
		load: {
			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},
		focus: {
			// Fire native event if possible so blur/focus sequence is correct
			trigger: function() {
				if ( this !== safeActiveElement() && this.focus ) {
					this.focus();
					return false;
				}
			},
			delegateType: "focusin"
		},
		blur: {
			trigger: function() {
				if ( this === safeActiveElement() && this.blur ) {
					this.blur();
					return false;
				}
			},
			delegateType: "focusout"
		},
		click: {
			// For checkbox, fire native event so checked state will be right
			trigger: function() {
				if ( this.type === "checkbox" && this.click && jQuery.nodeName( this, "input" ) ) {
					this.click();
					return false;
				}
			},

			// For cross-browser consistency, don't fire native .click() on links
			_default: function( event ) {
				return jQuery.nodeName( event.target, "a" );
			}
		},

		beforeunload: {
			postDispatch: function( event ) {

				// Support: Firefox 20+
				// Firefox doesn't alert if the returnValue field is not set.
				if ( event.result !== undefined && event.originalEvent ) {
					event.originalEvent.returnValue = event.result;
				}
			}
		}
	},

	simulate: function( type, elem, event, bubble ) {
		// Piggyback on a donor event to simulate a different one.
		// Fake originalEvent to avoid donor's stopPropagation, but if the
		// simulated event prevents default then we do the same on the donor.
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{
				type: type,
				isSimulated: true,
				originalEvent: {}
			}
		);
		if ( bubble ) {
			jQuery.event.trigger( e, null, elem );
		} else {
			jQuery.event.dispatch.call( elem, e );
		}
		if ( e.isDefaultPrevented() ) {
			event.preventDefault();
		}
	}
};

jQuery.removeEvent = function( elem, type, handle ) {
	if ( elem.removeEventListener ) {
		elem.removeEventListener( type, handle, false );
	}
};

jQuery.Event = function( src, props ) {
	// Allow instantiation without the 'new' keyword
	if ( !(this instanceof jQuery.Event) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = src.defaultPrevented ||
				src.defaultPrevented === undefined &&
				// Support: Android<4.0
				src.returnValue === false ?
			returnTrue :
			returnFalse;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || jQuery.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse,

	preventDefault: function() {
		var e = this.originalEvent;

		this.isDefaultPrevented = returnTrue;

		if ( e && e.preventDefault ) {
			e.preventDefault();
		}
	},
	stopPropagation: function() {
		var e = this.originalEvent;

		this.isPropagationStopped = returnTrue;

		if ( e && e.stopPropagation ) {
			e.stopPropagation();
		}
	},
	stopImmediatePropagation: function() {
		var e = this.originalEvent;

		this.isImmediatePropagationStopped = returnTrue;

		if ( e && e.stopImmediatePropagation ) {
			e.stopImmediatePropagation();
		}

		this.stopPropagation();
	}
};

// Create mouseenter/leave events using mouseover/out and event-time checks
// Support: Chrome 15+
jQuery.each({
	mouseenter: "mouseover",
	mouseleave: "mouseout",
	pointerenter: "pointerover",
	pointerleave: "pointerout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj;

			// For mousenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || (related !== target && !jQuery.contains( target, related )) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
});

// Support: Firefox, Chrome, Safari
// Create "bubbling" focus and blur events
if ( !support.focusinBubbles ) {
	jQuery.each({ focus: "focusin", blur: "focusout" }, function( orig, fix ) {

		// Attach a single capturing handler on the document while someone wants focusin/focusout
		var handler = function( event ) {
				jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ), true );
			};

		jQuery.event.special[ fix ] = {
			setup: function() {
				var doc = this.ownerDocument || this,
					attaches = data_priv.access( doc, fix );

				if ( !attaches ) {
					doc.addEventListener( orig, handler, true );
				}
				data_priv.access( doc, fix, ( attaches || 0 ) + 1 );
			},
			teardown: function() {
				var doc = this.ownerDocument || this,
					attaches = data_priv.access( doc, fix ) - 1;

				if ( !attaches ) {
					doc.removeEventListener( orig, handler, true );
					data_priv.remove( doc, fix );

				} else {
					data_priv.access( doc, fix, attaches );
				}
			}
		};
	});
}

jQuery.fn.extend({

	on: function( types, selector, data, fn, /*INTERNAL*/ one ) {
		var origFn, type;

		// Types can be a map of types/handlers
		if ( typeof types === "object" ) {
			// ( types-Object, selector, data )
			if ( typeof selector !== "string" ) {
				// ( types-Object, data )
				data = data || selector;
				selector = undefined;
			}
			for ( type in types ) {
				this.on( type, selector, data, types[ type ], one );
			}
			return this;
		}

		if ( data == null && fn == null ) {
			// ( types, fn )
			fn = selector;
			data = selector = undefined;
		} else if ( fn == null ) {
			if ( typeof selector === "string" ) {
				// ( types, selector, fn )
				fn = data;
				data = undefined;
			} else {
				// ( types, data, fn )
				fn = data;
				data = selector;
				selector = undefined;
			}
		}
		if ( fn === false ) {
			fn = returnFalse;
		} else if ( !fn ) {
			return this;
		}

		if ( one === 1 ) {
			origFn = fn;
			fn = function( event ) {
				// Can use an empty set, since event contains the info
				jQuery().off( event );
				return origFn.apply( this, arguments );
			};
			// Use same guid so caller can remove using origFn
			fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
		}
		return this.each( function() {
			jQuery.event.add( this, types, fn, data, selector );
		});
	},
	one: function( types, selector, data, fn ) {
		return this.on( types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {
			// ( event )  dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ? handleObj.origType + "." + handleObj.namespace : handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {
			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {
			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each(function() {
			jQuery.event.remove( this, types, fn, selector );
		});
	},

	trigger: function( type, data ) {
		return this.each(function() {
			jQuery.event.trigger( type, data, this );
		});
	},
	triggerHandler: function( type, data ) {
		var elem = this[0];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
});


var
	rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
	rtagName = /<([\w:]+)/,
	rhtml = /<|&#?\w+;/,
	rnoInnerhtml = /<(?:script|style|link)/i,
	// checked="checked" or checked
	rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
	rscriptType = /^$|\/(?:java|ecma)script/i,
	rscriptTypeMasked = /^true\/(.*)/,
	rcleanScript = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,

	// We have to close these tags to support XHTML (#13200)
	wrapMap = {

		// Support: IE9
		option: [ 1, "<select multiple='multiple'>", "</select>" ],

		thead: [ 1, "<table>", "</table>" ],
		col: [ 2, "<table><colgroup>", "</colgroup></table>" ],
		tr: [ 2, "<table><tbody>", "</tbody></table>" ],
		td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],

		_default: [ 0, "", "" ]
	};

// Support: IE9
wrapMap.optgroup = wrapMap.option;

wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;

// Support: 1.x compatibility
// Manipulating tables requires a tbody
function manipulationTarget( elem, content ) {
	return jQuery.nodeName( elem, "table" ) &&
		jQuery.nodeName( content.nodeType !== 11 ? content : content.firstChild, "tr" ) ?

		elem.getElementsByTagName("tbody")[0] ||
			elem.appendChild( elem.ownerDocument.createElement("tbody") ) :
		elem;
}

// Replace/restore the type attribute of script elements for safe DOM manipulation
function disableScript( elem ) {
	elem.type = (elem.getAttribute("type") !== null) + "/" + elem.type;
	return elem;
}
function restoreScript( elem ) {
	var match = rscriptTypeMasked.exec( elem.type );

	if ( match ) {
		elem.type = match[ 1 ];
	} else {
		elem.removeAttribute("type");
	}

	return elem;
}

// Mark scripts as having already been evaluated
function setGlobalEval( elems, refElements ) {
	var i = 0,
		l = elems.length;

	for ( ; i < l; i++ ) {
		data_priv.set(
			elems[ i ], "globalEval", !refElements || data_priv.get( refElements[ i ], "globalEval" )
		);
	}
}

function cloneCopyEvent( src, dest ) {
	var i, l, type, pdataOld, pdataCur, udataOld, udataCur, events;

	if ( dest.nodeType !== 1 ) {
		return;
	}

	// 1. Copy private data: events, handlers, etc.
	if ( data_priv.hasData( src ) ) {
		pdataOld = data_priv.access( src );
		pdataCur = data_priv.set( dest, pdataOld );
		events = pdataOld.events;

		if ( events ) {
			delete pdataCur.handle;
			pdataCur.events = {};

			for ( type in events ) {
				for ( i = 0, l = events[ type ].length; i < l; i++ ) {
					jQuery.event.add( dest, type, events[ type ][ i ] );
				}
			}
		}
	}

	// 2. Copy user data
	if ( data_user.hasData( src ) ) {
		udataOld = data_user.access( src );
		udataCur = jQuery.extend( {}, udataOld );

		data_user.set( dest, udataCur );
	}
}

function getAll( context, tag ) {
	var ret = context.getElementsByTagName ? context.getElementsByTagName( tag || "*" ) :
			context.querySelectorAll ? context.querySelectorAll( tag || "*" ) :
			[];

	return tag === undefined || tag && jQuery.nodeName( context, tag ) ?
		jQuery.merge( [ context ], ret ) :
		ret;
}

// Fix IE bugs, see support tests
function fixInput( src, dest ) {
	var nodeName = dest.nodeName.toLowerCase();

	// Fails to persist the checked state of a cloned checkbox or radio button.
	if ( nodeName === "input" && rcheckableType.test( src.type ) ) {
		dest.checked = src.checked;

	// Fails to return the selected option to the default selected state when cloning options
	} else if ( nodeName === "input" || nodeName === "textarea" ) {
		dest.defaultValue = src.defaultValue;
	}
}

jQuery.extend({
	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var i, l, srcElements, destElements,
			clone = elem.cloneNode( true ),
			inPage = jQuery.contains( elem.ownerDocument, elem );

		// Fix IE cloning issues
		if ( !support.noCloneChecked && ( elem.nodeType === 1 || elem.nodeType === 11 ) &&
				!jQuery.isXMLDoc( elem ) ) {

			// We eschew Sizzle here for performance reasons: http://jsperf.com/getall-vs-sizzle/2
			destElements = getAll( clone );
			srcElements = getAll( elem );

			for ( i = 0, l = srcElements.length; i < l; i++ ) {
				fixInput( srcElements[ i ], destElements[ i ] );
			}
		}

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			if ( deepDataAndEvents ) {
				srcElements = srcElements || getAll( elem );
				destElements = destElements || getAll( clone );

				for ( i = 0, l = srcElements.length; i < l; i++ ) {
					cloneCopyEvent( srcElements[ i ], destElements[ i ] );
				}
			} else {
				cloneCopyEvent( elem, clone );
			}
		}

		// Preserve script evaluation history
		destElements = getAll( clone, "script" );
		if ( destElements.length > 0 ) {
			setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
		}

		// Return the cloned set
		return clone;
	},

	buildFragment: function( elems, context, scripts, selection ) {
		var elem, tmp, tag, wrap, contains, j,
			fragment = context.createDocumentFragment(),
			nodes = [],
			i = 0,
			l = elems.length;

		for ( ; i < l; i++ ) {
			elem = elems[ i ];

			if ( elem || elem === 0 ) {

				// Add nodes directly
				if ( jQuery.type( elem ) === "object" ) {
					// Support: QtWebKit, PhantomJS
					// push.apply(_, arraylike) throws on ancient WebKit
					jQuery.merge( nodes, elem.nodeType ? [ elem ] : elem );

				// Convert non-html into a text node
				} else if ( !rhtml.test( elem ) ) {
					nodes.push( context.createTextNode( elem ) );

				// Convert html into DOM nodes
				} else {
					tmp = tmp || fragment.appendChild( context.createElement("div") );

					// Deserialize a standard representation
					tag = ( rtagName.exec( elem ) || [ "", "" ] )[ 1 ].toLowerCase();
					wrap = wrapMap[ tag ] || wrapMap._default;
					tmp.innerHTML = wrap[ 1 ] + elem.replace( rxhtmlTag, "<$1></$2>" ) + wrap[ 2 ];

					// Descend through wrappers to the right content
					j = wrap[ 0 ];
					while ( j-- ) {
						tmp = tmp.lastChild;
					}

					// Support: QtWebKit, PhantomJS
					// push.apply(_, arraylike) throws on ancient WebKit
					jQuery.merge( nodes, tmp.childNodes );

					// Remember the top-level container
					tmp = fragment.firstChild;

					// Ensure the created nodes are orphaned (#12392)
					tmp.textContent = "";
				}
			}
		}

		// Remove wrapper from fragment
		fragment.textContent = "";

		i = 0;
		while ( (elem = nodes[ i++ ]) ) {

			// #4087 - If origin and destination elements are the same, and this is
			// that element, do not do anything
			if ( selection && jQuery.inArray( elem, selection ) !== -1 ) {
				continue;
			}

			contains = jQuery.contains( elem.ownerDocument, elem );

			// Append to fragment
			tmp = getAll( fragment.appendChild( elem ), "script" );

			// Preserve script evaluation history
			if ( contains ) {
				setGlobalEval( tmp );
			}

			// Capture executables
			if ( scripts ) {
				j = 0;
				while ( (elem = tmp[ j++ ]) ) {
					if ( rscriptType.test( elem.type || "" ) ) {
						scripts.push( elem );
					}
				}
			}
		}

		return fragment;
	},

	cleanData: function( elems ) {
		var data, elem, type, key,
			special = jQuery.event.special,
			i = 0;

		for ( ; (elem = elems[ i ]) !== undefined; i++ ) {
			if ( jQuery.acceptData( elem ) ) {
				key = elem[ data_priv.expando ];

				if ( key && (data = data_priv.cache[ key ]) ) {
					if ( data.events ) {
						for ( type in data.events ) {
							if ( special[ type ] ) {
								jQuery.event.remove( elem, type );

							// This is a shortcut to avoid jQuery.event.remove's overhead
							} else {
								jQuery.removeEvent( elem, type, data.handle );
							}
						}
					}
					if ( data_priv.cache[ key ] ) {
						// Discard any remaining `private` data
						delete data_priv.cache[ key ];
					}
				}
			}
			// Discard any remaining `user` data
			delete data_user.cache[ elem[ data_user.expando ] ];
		}
	}
});

jQuery.fn.extend({
	text: function( value ) {
		return access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().each(function() {
					if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
						this.textContent = value;
					}
				});
		}, null, value, arguments.length );
	},

	append: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.appendChild( elem );
			}
		});
	},

	prepend: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.insertBefore( elem, target.firstChild );
			}
		});
	},

	before: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this );
			}
		});
	},

	after: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			}
		});
	},

	remove: function( selector, keepData /* Internal Use Only */ ) {
		var elem,
			elems = selector ? jQuery.filter( selector, this ) : this,
			i = 0;

		for ( ; (elem = elems[i]) != null; i++ ) {
			if ( !keepData && elem.nodeType === 1 ) {
				jQuery.cleanData( getAll( elem ) );
			}

			if ( elem.parentNode ) {
				if ( keepData && jQuery.contains( elem.ownerDocument, elem ) ) {
					setGlobalEval( getAll( elem, "script" ) );
				}
				elem.parentNode.removeChild( elem );
			}
		}

		return this;
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; (elem = this[i]) != null; i++ ) {
			if ( elem.nodeType === 1 ) {

				// Prevent memory leaks
				jQuery.cleanData( getAll( elem, false ) );

				// Remove any remaining nodes
				elem.textContent = "";
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map(function() {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		});
	},

	html: function( value ) {
		return access( this, function( value ) {
			var elem = this[ 0 ] || {},
				i = 0,
				l = this.length;

			if ( value === undefined && elem.nodeType === 1 ) {
				return elem.innerHTML;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				!wrapMap[ ( rtagName.exec( value ) || [ "", "" ] )[ 1 ].toLowerCase() ] ) {

				value = value.replace( rxhtmlTag, "<$1></$2>" );

				try {
					for ( ; i < l; i++ ) {
						elem = this[ i ] || {};

						// Remove element nodes and prevent memory leaks
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( getAll( elem, false ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch( e ) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function() {
		var arg = arguments[ 0 ];

		// Make the changes, replacing each context element with the new content
		this.domManip( arguments, function( elem ) {
			arg = this.parentNode;

			jQuery.cleanData( getAll( this ) );

			if ( arg ) {
				arg.replaceChild( elem, this );
			}
		});

		// Force removal if there was no new content (e.g., from empty arguments)
		return arg && (arg.length || arg.nodeType) ? this : this.remove();
	},

	detach: function( selector ) {
		return this.remove( selector, true );
	},

	domManip: function( args, callback ) {

		// Flatten any nested arrays
		args = concat.apply( [], args );

		var fragment, first, scripts, hasScripts, node, doc,
			i = 0,
			l = this.length,
			set = this,
			iNoClone = l - 1,
			value = args[ 0 ],
			isFunction = jQuery.isFunction( value );

		// We can't cloneNode fragments that contain checked, in WebKit
		if ( isFunction ||
				( l > 1 && typeof value === "string" &&
					!support.checkClone && rchecked.test( value ) ) ) {
			return this.each(function( index ) {
				var self = set.eq( index );
				if ( isFunction ) {
					args[ 0 ] = value.call( this, index, self.html() );
				}
				self.domManip( args, callback );
			});
		}

		if ( l ) {
			fragment = jQuery.buildFragment( args, this[ 0 ].ownerDocument, false, this );
			first = fragment.firstChild;

			if ( fragment.childNodes.length === 1 ) {
				fragment = first;
			}

			if ( first ) {
				scripts = jQuery.map( getAll( fragment, "script" ), disableScript );
				hasScripts = scripts.length;

				// Use the original fragment for the last item instead of the first because it can end up
				// being emptied incorrectly in certain situations (#8070).
				for ( ; i < l; i++ ) {
					node = fragment;

					if ( i !== iNoClone ) {
						node = jQuery.clone( node, true, true );

						// Keep references to cloned scripts for later restoration
						if ( hasScripts ) {
							// Support: QtWebKit
							// jQuery.merge because push.apply(_, arraylike) throws
							jQuery.merge( scripts, getAll( node, "script" ) );
						}
					}

					callback.call( this[ i ], node, i );
				}

				if ( hasScripts ) {
					doc = scripts[ scripts.length - 1 ].ownerDocument;

					// Reenable scripts
					jQuery.map( scripts, restoreScript );

					// Evaluate executable scripts on first document insertion
					for ( i = 0; i < hasScripts; i++ ) {
						node = scripts[ i ];
						if ( rscriptType.test( node.type || "" ) &&
							!data_priv.access( node, "globalEval" ) && jQuery.contains( doc, node ) ) {

							if ( node.src ) {
								// Optional AJAX dependency, but won't run scripts if not present
								if ( jQuery._evalUrl ) {
									jQuery._evalUrl( node.src );
								}
							} else {
								jQuery.globalEval( node.textContent.replace( rcleanScript, "" ) );
							}
						}
					}
				}
			}
		}

		return this;
	}
});

jQuery.each({
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			ret = [],
			insert = jQuery( selector ),
			last = insert.length - 1,
			i = 0;

		for ( ; i <= last; i++ ) {
			elems = i === last ? this : this.clone( true );
			jQuery( insert[ i ] )[ original ]( elems );

			// Support: QtWebKit
			// .get() because push.apply(_, arraylike) throws
			push.apply( ret, elems.get() );
		}

		return this.pushStack( ret );
	};
});


var iframe,
	elemdisplay = {};

/**
 * Retrieve the actual display of a element
 * @param {String} name nodeName of the element
 * @param {Object} doc Document object
 */
// Called only from within defaultDisplay
function actualDisplay( name, doc ) {
	var style,
		elem = jQuery( doc.createElement( name ) ).appendTo( doc.body ),

		// getDefaultComputedStyle might be reliably used only on attached element
		display = window.getDefaultComputedStyle && ( style = window.getDefaultComputedStyle( elem[ 0 ] ) ) ?

			// Use of this method is a temporary fix (more like optimization) until something better comes along,
			// since it was removed from specification and supported only in FF
			style.display : jQuery.css( elem[ 0 ], "display" );

	// We don't have any data stored on the element,
	// so use "detach" method as fast way to get rid of the element
	elem.detach();

	return display;
}

/**
 * Try to determine the default display value of an element
 * @param {String} nodeName
 */
function defaultDisplay( nodeName ) {
	var doc = document,
		display = elemdisplay[ nodeName ];

	if ( !display ) {
		display = actualDisplay( nodeName, doc );

		// If the simple way fails, read from inside an iframe
		if ( display === "none" || !display ) {

			// Use the already-created iframe if possible
			iframe = (iframe || jQuery( "<iframe frameborder='0' width='0' height='0'/>" )).appendTo( doc.documentElement );

			// Always write a new HTML skeleton so Webkit and Firefox don't choke on reuse
			doc = iframe[ 0 ].contentDocument;

			// Support: IE
			doc.write();
			doc.close();

			display = actualDisplay( nodeName, doc );
			iframe.detach();
		}

		// Store the correct default display
		elemdisplay[ nodeName ] = display;
	}

	return display;
}
var rmargin = (/^margin/);

var rnumnonpx = new RegExp( "^(" + pnum + ")(?!px)[a-z%]+$", "i" );

var getStyles = function( elem ) {
		// Support: IE<=11+, Firefox<=30+ (#15098, #14150)
		// IE throws on elements created in popups
		// FF meanwhile throws on frame elements through "defaultView.getComputedStyle"
		if ( elem.ownerDocument.defaultView.opener ) {
			return elem.ownerDocument.defaultView.getComputedStyle( elem, null );
		}

		return window.getComputedStyle( elem, null );
	};



function curCSS( elem, name, computed ) {
	var width, minWidth, maxWidth, ret,
		style = elem.style;

	computed = computed || getStyles( elem );

	// Support: IE9
	// getPropertyValue is only needed for .css('filter') (#12537)
	if ( computed ) {
		ret = computed.getPropertyValue( name ) || computed[ name ];
	}

	if ( computed ) {

		if ( ret === "" && !jQuery.contains( elem.ownerDocument, elem ) ) {
			ret = jQuery.style( elem, name );
		}

		// Support: iOS < 6
		// A tribute to the "awesome hack by Dean Edwards"
		// iOS < 6 (at least) returns percentage for a larger set of values, but width seems to be reliably pixels
		// this is against the CSSOM draft spec: http://dev.w3.org/csswg/cssom/#resolved-values
		if ( rnumnonpx.test( ret ) && rmargin.test( name ) ) {

			// Remember the original values
			width = style.width;
			minWidth = style.minWidth;
			maxWidth = style.maxWidth;

			// Put in the new values to get a computed value out
			style.minWidth = style.maxWidth = style.width = ret;
			ret = computed.width;

			// Revert the changed values
			style.width = width;
			style.minWidth = minWidth;
			style.maxWidth = maxWidth;
		}
	}

	return ret !== undefined ?
		// Support: IE
		// IE returns zIndex value as an integer.
		ret + "" :
		ret;
}


function addGetHookIf( conditionFn, hookFn ) {
	// Define the hook, we'll check on the first run if it's really needed.
	return {
		get: function() {
			if ( conditionFn() ) {
				// Hook not needed (or it's not possible to use it due
				// to missing dependency), remove it.
				delete this.get;
				return;
			}

			// Hook needed; redefine it so that the support test is not executed again.
			return (this.get = hookFn).apply( this, arguments );
		}
	};
}


(function() {
	var pixelPositionVal, boxSizingReliableVal,
		docElem = document.documentElement,
		container = document.createElement( "div" ),
		div = document.createElement( "div" );

	if ( !div.style ) {
		return;
	}

	// Support: IE9-11+
	// Style of cloned element affects source element cloned (#8908)
	div.style.backgroundClip = "content-box";
	div.cloneNode( true ).style.backgroundClip = "";
	support.clearCloneStyle = div.style.backgroundClip === "content-box";

	container.style.cssText = "border:0;width:0;height:0;top:0;left:-9999px;margin-top:1px;" +
		"position:absolute";
	container.appendChild( div );

	// Executing both pixelPosition & boxSizingReliable tests require only one layout
	// so they're executed at the same time to save the second computation.
	function computePixelPositionAndBoxSizingReliable() {
		div.style.cssText =
			// Support: Firefox<29, Android 2.3
			// Vendor-prefix box-sizing
			"-webkit-box-sizing:border-box;-moz-box-sizing:border-box;" +
			"box-sizing:border-box;display:block;margin-top:1%;top:1%;" +
			"border:1px;padding:1px;width:4px;position:absolute";
		div.innerHTML = "";
		docElem.appendChild( container );

		var divStyle = window.getComputedStyle( div, null );
		pixelPositionVal = divStyle.top !== "1%";
		boxSizingReliableVal = divStyle.width === "4px";

		docElem.removeChild( container );
	}

	// Support: node.js jsdom
	// Don't assume that getComputedStyle is a property of the global object
	if ( window.getComputedStyle ) {
		jQuery.extend( support, {
			pixelPosition: function() {

				// This test is executed only once but we still do memoizing
				// since we can use the boxSizingReliable pre-computing.
				// No need to check if the test was already performed, though.
				computePixelPositionAndBoxSizingReliable();
				return pixelPositionVal;
			},
			boxSizingReliable: function() {
				if ( boxSizingReliableVal == null ) {
					computePixelPositionAndBoxSizingReliable();
				}
				return boxSizingReliableVal;
			},
			reliableMarginRight: function() {

				// Support: Android 2.3
				// Check if div with explicit width and no margin-right incorrectly
				// gets computed margin-right based on width of container. (#3333)
				// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
				// This support function is only executed once so no memoizing is needed.
				var ret,
					marginDiv = div.appendChild( document.createElement( "div" ) );

				// Reset CSS: box-sizing; display; margin; border; padding
				marginDiv.style.cssText = div.style.cssText =
					// Support: Firefox<29, Android 2.3
					// Vendor-prefix box-sizing
					"-webkit-box-sizing:content-box;-moz-box-sizing:content-box;" +
					"box-sizing:content-box;display:block;margin:0;border:0;padding:0";
				marginDiv.style.marginRight = marginDiv.style.width = "0";
				div.style.width = "1px";
				docElem.appendChild( container );

				ret = !parseFloat( window.getComputedStyle( marginDiv, null ).marginRight );

				docElem.removeChild( container );
				div.removeChild( marginDiv );

				return ret;
			}
		});
	}
})();


// A method for quickly swapping in/out CSS properties to get correct calculations.
jQuery.swap = function( elem, options, callback, args ) {
	var ret, name,
		old = {};

	// Remember the old values, and insert the new ones
	for ( name in options ) {
		old[ name ] = elem.style[ name ];
		elem.style[ name ] = options[ name ];
	}

	ret = callback.apply( elem, args || [] );

	// Revert the old values
	for ( name in options ) {
		elem.style[ name ] = old[ name ];
	}

	return ret;
};


var
	// Swappable if display is none or starts with table except "table", "table-cell", or "table-caption"
	// See here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
	rdisplayswap = /^(none|table(?!-c[ea]).+)/,
	rnumsplit = new RegExp( "^(" + pnum + ")(.*)$", "i" ),
	rrelNum = new RegExp( "^([+-])=(" + pnum + ")", "i" ),

	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
	cssNormalTransform = {
		letterSpacing: "0",
		fontWeight: "400"
	},

	cssPrefixes = [ "Webkit", "O", "Moz", "ms" ];

// Return a css property mapped to a potentially vendor prefixed property
function vendorPropName( style, name ) {

	// Shortcut for names that are not vendor prefixed
	if ( name in style ) {
		return name;
	}

	// Check for vendor prefixed names
	var capName = name[0].toUpperCase() + name.slice(1),
		origName = name,
		i = cssPrefixes.length;

	while ( i-- ) {
		name = cssPrefixes[ i ] + capName;
		if ( name in style ) {
			return name;
		}
	}

	return origName;
}

function setPositiveNumber( elem, value, subtract ) {
	var matches = rnumsplit.exec( value );
	return matches ?
		// Guard against undefined "subtract", e.g., when used as in cssHooks
		Math.max( 0, matches[ 1 ] - ( subtract || 0 ) ) + ( matches[ 2 ] || "px" ) :
		value;
}

function augmentWidthOrHeight( elem, name, extra, isBorderBox, styles ) {
	var i = extra === ( isBorderBox ? "border" : "content" ) ?
		// If we already have the right measurement, avoid augmentation
		4 :
		// Otherwise initialize for horizontal or vertical properties
		name === "width" ? 1 : 0,

		val = 0;

	for ( ; i < 4; i += 2 ) {
		// Both box models exclude margin, so add it if we want it
		if ( extra === "margin" ) {
			val += jQuery.css( elem, extra + cssExpand[ i ], true, styles );
		}

		if ( isBorderBox ) {
			// border-box includes padding, so remove it if we want content
			if ( extra === "content" ) {
				val -= jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );
			}

			// At this point, extra isn't border nor margin, so remove border
			if ( extra !== "margin" ) {
				val -= jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		} else {
			// At this point, extra isn't content, so add padding
			val += jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );

			// At this point, extra isn't content nor padding, so add border
			if ( extra !== "padding" ) {
				val += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		}
	}

	return val;
}

function getWidthOrHeight( elem, name, extra ) {

	// Start with offset property, which is equivalent to the border-box value
	var valueIsBorderBox = true,
		val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
		styles = getStyles( elem ),
		isBorderBox = jQuery.css( elem, "boxSizing", false, styles ) === "border-box";

	// Some non-html elements return undefined for offsetWidth, so check for null/undefined
	// svg - https://bugzilla.mozilla.org/show_bug.cgi?id=649285
	// MathML - https://bugzilla.mozilla.org/show_bug.cgi?id=491668
	if ( val <= 0 || val == null ) {
		// Fall back to computed then uncomputed css if necessary
		val = curCSS( elem, name, styles );
		if ( val < 0 || val == null ) {
			val = elem.style[ name ];
		}

		// Computed unit is not pixels. Stop here and return.
		if ( rnumnonpx.test(val) ) {
			return val;
		}

		// Check for style in case a browser which returns unreliable values
		// for getComputedStyle silently falls back to the reliable elem.style
		valueIsBorderBox = isBorderBox &&
			( support.boxSizingReliable() || val === elem.style[ name ] );

		// Normalize "", auto, and prepare for extra
		val = parseFloat( val ) || 0;
	}

	// Use the active box-sizing model to add/subtract irrelevant styles
	return ( val +
		augmentWidthOrHeight(
			elem,
			name,
			extra || ( isBorderBox ? "border" : "content" ),
			valueIsBorderBox,
			styles
		)
	) + "px";
}

function showHide( elements, show ) {
	var display, elem, hidden,
		values = [],
		index = 0,
		length = elements.length;

	for ( ; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}

		values[ index ] = data_priv.get( elem, "olddisplay" );
		display = elem.style.display;
		if ( show ) {
			// Reset the inline display of this element to learn if it is
			// being hidden by cascaded rules or not
			if ( !values[ index ] && display === "none" ) {
				elem.style.display = "";
			}

			// Set elements which have been overridden with display: none
			// in a stylesheet to whatever the default browser style is
			// for such an element
			if ( elem.style.display === "" && isHidden( elem ) ) {
				values[ index ] = data_priv.access( elem, "olddisplay", defaultDisplay(elem.nodeName) );
			}
		} else {
			hidden = isHidden( elem );

			if ( display !== "none" || !hidden ) {
				data_priv.set( elem, "olddisplay", hidden ? display : jQuery.css( elem, "display" ) );
			}
		}
	}

	// Set the display of most of the elements in a second loop
	// to avoid the constant reflow
	for ( index = 0; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}
		if ( !show || elem.style.display === "none" || elem.style.display === "" ) {
			elem.style.display = show ? values[ index ] || "" : "none";
		}
	}

	return elements;
}

jQuery.extend({

	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {
		opacity: {
			get: function( elem, computed ) {
				if ( computed ) {

					// We should always get a number back from opacity
					var ret = curCSS( elem, "opacity" );
					return ret === "" ? "1" : ret;
				}
			}
		}
	},

	// Don't automatically add "px" to these possibly-unitless properties
	cssNumber: {
		"columnCount": true,
		"fillOpacity": true,
		"flexGrow": true,
		"flexShrink": true,
		"fontWeight": true,
		"lineHeight": true,
		"opacity": true,
		"order": true,
		"orphans": true,
		"widows": true,
		"zIndex": true,
		"zoom": true
	},

	// Add in properties whose names you wish to fix before
	// setting or getting the value
	cssProps: {
		"float": "cssFloat"
	},

	// Get and set the style property on a DOM Node
	style: function( elem, name, value, extra ) {

		// Don't set styles on text and comment nodes
		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
			return;
		}

		// Make sure that we're working with the right name
		var ret, type, hooks,
			origName = jQuery.camelCase( name ),
			style = elem.style;

		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( style, origName ) );

		// Gets hook for the prefixed version, then unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// Check if we're setting a value
		if ( value !== undefined ) {
			type = typeof value;

			// Convert "+=" or "-=" to relative numbers (#7345)
			if ( type === "string" && (ret = rrelNum.exec( value )) ) {
				value = ( ret[1] + 1 ) * ret[2] + parseFloat( jQuery.css( elem, name ) );
				// Fixes bug #9237
				type = "number";
			}

			// Make sure that null and NaN values aren't set (#7116)
			if ( value == null || value !== value ) {
				return;
			}

			// If a number, add 'px' to the (except for certain CSS properties)
			if ( type === "number" && !jQuery.cssNumber[ origName ] ) {
				value += "px";
			}

			// Support: IE9-11+
			// background-* props affect original clone's values
			if ( !support.clearCloneStyle && value === "" && name.indexOf( "background" ) === 0 ) {
				style[ name ] = "inherit";
			}

			// If a hook was provided, use that value, otherwise just set the specified value
			if ( !hooks || !("set" in hooks) || (value = hooks.set( elem, value, extra )) !== undefined ) {
				style[ name ] = value;
			}

		} else {
			// If a hook was provided get the non-computed value from there
			if ( hooks && "get" in hooks && (ret = hooks.get( elem, false, extra )) !== undefined ) {
				return ret;
			}

			// Otherwise just get the value from the style object
			return style[ name ];
		}
	},

	css: function( elem, name, extra, styles ) {
		var val, num, hooks,
			origName = jQuery.camelCase( name );

		// Make sure that we're working with the right name
		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( elem.style, origName ) );

		// Try prefixed name followed by the unprefixed name
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// If a hook was provided get the computed value from there
		if ( hooks && "get" in hooks ) {
			val = hooks.get( elem, true, extra );
		}

		// Otherwise, if a way to get the computed value exists, use that
		if ( val === undefined ) {
			val = curCSS( elem, name, styles );
		}

		// Convert "normal" to computed value
		if ( val === "normal" && name in cssNormalTransform ) {
			val = cssNormalTransform[ name ];
		}

		// Make numeric if forced or a qualifier was provided and val looks numeric
		if ( extra === "" || extra ) {
			num = parseFloat( val );
			return extra === true || jQuery.isNumeric( num ) ? num || 0 : val;
		}
		return val;
	}
});

jQuery.each([ "height", "width" ], function( i, name ) {
	jQuery.cssHooks[ name ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {

				// Certain elements can have dimension info if we invisibly show them
				// but it must have a current display style that would benefit
				return rdisplayswap.test( jQuery.css( elem, "display" ) ) && elem.offsetWidth === 0 ?
					jQuery.swap( elem, cssShow, function() {
						return getWidthOrHeight( elem, name, extra );
					}) :
					getWidthOrHeight( elem, name, extra );
			}
		},

		set: function( elem, value, extra ) {
			var styles = extra && getStyles( elem );
			return setPositiveNumber( elem, value, extra ?
				augmentWidthOrHeight(
					elem,
					name,
					extra,
					jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
					styles
				) : 0
			);
		}
	};
});

// Support: Android 2.3
jQuery.cssHooks.marginRight = addGetHookIf( support.reliableMarginRight,
	function( elem, computed ) {
		if ( computed ) {
			return jQuery.swap( elem, { "display": "inline-block" },
				curCSS, [ elem, "marginRight" ] );
		}
	}
);

// These hooks are used by animate to expand properties
jQuery.each({
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {
	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i = 0,
				expanded = {},

				// Assumes a single number if not a string
				parts = typeof value === "string" ? value.split(" ") : [ value ];

			for ( ; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};

	if ( !rmargin.test( prefix ) ) {
		jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
	}
});

jQuery.fn.extend({
	css: function( name, value ) {
		return access( this, function( elem, name, value ) {
			var styles, len,
				map = {},
				i = 0;

			if ( jQuery.isArray( name ) ) {
				styles = getStyles( elem );
				len = name.length;

				for ( ; i < len; i++ ) {
					map[ name[ i ] ] = jQuery.css( elem, name[ i ], false, styles );
				}

				return map;
			}

			return value !== undefined ?
				jQuery.style( elem, name, value ) :
				jQuery.css( elem, name );
		}, name, value, arguments.length > 1 );
	},
	show: function() {
		return showHide( this, true );
	},
	hide: function() {
		return showHide( this );
	},
	toggle: function( state ) {
		if ( typeof state === "boolean" ) {
			return state ? this.show() : this.hide();
		}

		return this.each(function() {
			if ( isHidden( this ) ) {
				jQuery( this ).show();
			} else {
				jQuery( this ).hide();
			}
		});
	}
});


function Tween( elem, options, prop, end, easing ) {
	return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
	constructor: Tween,
	init: function( elem, options, prop, end, easing, unit ) {
		this.elem = elem;
		this.prop = prop;
		this.easing = easing || "swing";
		this.options = options;
		this.start = this.now = this.cur();
		this.end = end;
		this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
	},
	cur: function() {
		var hooks = Tween.propHooks[ this.prop ];

		return hooks && hooks.get ?
			hooks.get( this ) :
			Tween.propHooks._default.get( this );
	},
	run: function( percent ) {
		var eased,
			hooks = Tween.propHooks[ this.prop ];

		if ( this.options.duration ) {
			this.pos = eased = jQuery.easing[ this.easing ](
				percent, this.options.duration * percent, 0, 1, this.options.duration
			);
		} else {
			this.pos = eased = percent;
		}
		this.now = ( this.end - this.start ) * eased + this.start;

		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		if ( hooks && hooks.set ) {
			hooks.set( this );
		} else {
			Tween.propHooks._default.set( this );
		}
		return this;
	}
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
	_default: {
		get: function( tween ) {
			var result;

			if ( tween.elem[ tween.prop ] != null &&
				(!tween.elem.style || tween.elem.style[ tween.prop ] == null) ) {
				return tween.elem[ tween.prop ];
			}

			// Passing an empty string as a 3rd parameter to .css will automatically
			// attempt a parseFloat and fallback to a string if the parse fails.
			// Simple values such as "10px" are parsed to Float;
			// complex values such as "rotate(1rad)" are returned as-is.
			result = jQuery.css( tween.elem, tween.prop, "" );
			// Empty strings, null, undefined and "auto" are converted to 0.
			return !result || result === "auto" ? 0 : result;
		},
		set: function( tween ) {
			// Use step hook for back compat.
			// Use cssHook if its there.
			// Use .style if available and use plain properties where available.
			if ( jQuery.fx.step[ tween.prop ] ) {
				jQuery.fx.step[ tween.prop ]( tween );
			} else if ( tween.elem.style && ( tween.elem.style[ jQuery.cssProps[ tween.prop ] ] != null || jQuery.cssHooks[ tween.prop ] ) ) {
				jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
			} else {
				tween.elem[ tween.prop ] = tween.now;
			}
		}
	}
};

// Support: IE9
// Panic based approach to setting things on disconnected nodes
Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
	set: function( tween ) {
		if ( tween.elem.nodeType && tween.elem.parentNode ) {
			tween.elem[ tween.prop ] = tween.now;
		}
	}
};

jQuery.easing = {
	linear: function( p ) {
		return p;
	},
	swing: function( p ) {
		return 0.5 - Math.cos( p * Math.PI ) / 2;
	}
};

jQuery.fx = Tween.prototype.init;

// Back Compat <1.8 extension point
jQuery.fx.step = {};




var
	fxNow, timerId,
	rfxtypes = /^(?:toggle|show|hide)$/,
	rfxnum = new RegExp( "^(?:([+-])=|)(" + pnum + ")([a-z%]*)$", "i" ),
	rrun = /queueHooks$/,
	animationPrefilters = [ defaultPrefilter ],
	tweeners = {
		"*": [ function( prop, value ) {
			var tween = this.createTween( prop, value ),
				target = tween.cur(),
				parts = rfxnum.exec( value ),
				unit = parts && parts[ 3 ] || ( jQuery.cssNumber[ prop ] ? "" : "px" ),

				// Starting value computation is required for potential unit mismatches
				start = ( jQuery.cssNumber[ prop ] || unit !== "px" && +target ) &&
					rfxnum.exec( jQuery.css( tween.elem, prop ) ),
				scale = 1,
				maxIterations = 20;

			if ( start && start[ 3 ] !== unit ) {
				// Trust units reported by jQuery.css
				unit = unit || start[ 3 ];

				// Make sure we update the tween properties later on
				parts = parts || [];

				// Iteratively approximate from a nonzero starting point
				start = +target || 1;

				do {
					// If previous iteration zeroed out, double until we get *something*.
					// Use string for doubling so we don't accidentally see scale as unchanged below
					scale = scale || ".5";

					// Adjust and apply
					start = start / scale;
					jQuery.style( tween.elem, prop, start + unit );

				// Update scale, tolerating zero or NaN from tween.cur(),
				// break the loop if scale is unchanged or perfect, or if we've just had enough
				} while ( scale !== (scale = tween.cur() / target) && scale !== 1 && --maxIterations );
			}

			// Update tween properties
			if ( parts ) {
				start = tween.start = +start || +target || 0;
				tween.unit = unit;
				// If a +=/-= token was provided, we're doing a relative animation
				tween.end = parts[ 1 ] ?
					start + ( parts[ 1 ] + 1 ) * parts[ 2 ] :
					+parts[ 2 ];
			}

			return tween;
		} ]
	};

// Animations created synchronously will run synchronously
function createFxNow() {
	setTimeout(function() {
		fxNow = undefined;
	});
	return ( fxNow = jQuery.now() );
}

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
	var which,
		i = 0,
		attrs = { height: type };

	// If we include width, step value is 1 to do all cssExpand values,
	// otherwise step value is 2 to skip over Left and Right
	includeWidth = includeWidth ? 1 : 0;
	for ( ; i < 4 ; i += 2 - includeWidth ) {
		which = cssExpand[ i ];
		attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
	}

	if ( includeWidth ) {
		attrs.opacity = attrs.width = type;
	}

	return attrs;
}

function createTween( value, prop, animation ) {
	var tween,
		collection = ( tweeners[ prop ] || [] ).concat( tweeners[ "*" ] ),
		index = 0,
		length = collection.length;
	for ( ; index < length; index++ ) {
		if ( (tween = collection[ index ].call( animation, prop, value )) ) {

			// We're done with this property
			return tween;
		}
	}
}

function defaultPrefilter( elem, props, opts ) {
	/* jshint validthis: true */
	var prop, value, toggle, tween, hooks, oldfire, display, checkDisplay,
		anim = this,
		orig = {},
		style = elem.style,
		hidden = elem.nodeType && isHidden( elem ),
		dataShow = data_priv.get( elem, "fxshow" );

	// Handle queue: false promises
	if ( !opts.queue ) {
		hooks = jQuery._queueHooks( elem, "fx" );
		if ( hooks.unqueued == null ) {
			hooks.unqueued = 0;
			oldfire = hooks.empty.fire;
			hooks.empty.fire = function() {
				if ( !hooks.unqueued ) {
					oldfire();
				}
			};
		}
		hooks.unqueued++;

		anim.always(function() {
			// Ensure the complete handler is called before this completes
			anim.always(function() {
				hooks.unqueued--;
				if ( !jQuery.queue( elem, "fx" ).length ) {
					hooks.empty.fire();
				}
			});
		});
	}

	// Height/width overflow pass
	if ( elem.nodeType === 1 && ( "height" in props || "width" in props ) ) {
		// Make sure that nothing sneaks out
		// Record all 3 overflow attributes because IE9-10 do not
		// change the overflow attribute when overflowX and
		// overflowY are set to the same value
		opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

		// Set display property to inline-block for height/width
		// animations on inline elements that are having width/height animated
		display = jQuery.css( elem, "display" );

		// Test default display if display is currently "none"
		checkDisplay = display === "none" ?
			data_priv.get( elem, "olddisplay" ) || defaultDisplay( elem.nodeName ) : display;

		if ( checkDisplay === "inline" && jQuery.css( elem, "float" ) === "none" ) {
			style.display = "inline-block";
		}
	}

	if ( opts.overflow ) {
		style.overflow = "hidden";
		anim.always(function() {
			style.overflow = opts.overflow[ 0 ];
			style.overflowX = opts.overflow[ 1 ];
			style.overflowY = opts.overflow[ 2 ];
		});
	}

	// show/hide pass
	for ( prop in props ) {
		value = props[ prop ];
		if ( rfxtypes.exec( value ) ) {
			delete props[ prop ];
			toggle = toggle || value === "toggle";
			if ( value === ( hidden ? "hide" : "show" ) ) {

				// If there is dataShow left over from a stopped hide or show and we are going to proceed with show, we should pretend to be hidden
				if ( value === "show" && dataShow && dataShow[ prop ] !== undefined ) {
					hidden = true;
				} else {
					continue;
				}
			}
			orig[ prop ] = dataShow && dataShow[ prop ] || jQuery.style( elem, prop );

		// Any non-fx value stops us from restoring the original display value
		} else {
			display = undefined;
		}
	}

	if ( !jQuery.isEmptyObject( orig ) ) {
		if ( dataShow ) {
			if ( "hidden" in dataShow ) {
				hidden = dataShow.hidden;
			}
		} else {
			dataShow = data_priv.access( elem, "fxshow", {} );
		}

		// Store state if its toggle - enables .stop().toggle() to "reverse"
		if ( toggle ) {
			dataShow.hidden = !hidden;
		}
		if ( hidden ) {
			jQuery( elem ).show();
		} else {
			anim.done(function() {
				jQuery( elem ).hide();
			});
		}
		anim.done(function() {
			var prop;

			data_priv.remove( elem, "fxshow" );
			for ( prop in orig ) {
				jQuery.style( elem, prop, orig[ prop ] );
			}
		});
		for ( prop in orig ) {
			tween = createTween( hidden ? dataShow[ prop ] : 0, prop, anim );

			if ( !( prop in dataShow ) ) {
				dataShow[ prop ] = tween.start;
				if ( hidden ) {
					tween.end = tween.start;
					tween.start = prop === "width" || prop === "height" ? 1 : 0;
				}
			}
		}

	// If this is a noop like .hide().hide(), restore an overwritten display value
	} else if ( (display === "none" ? defaultDisplay( elem.nodeName ) : display) === "inline" ) {
		style.display = display;
	}
}

function propFilter( props, specialEasing ) {
	var index, name, easing, value, hooks;

	// camelCase, specialEasing and expand cssHook pass
	for ( index in props ) {
		name = jQuery.camelCase( index );
		easing = specialEasing[ name ];
		value = props[ index ];
		if ( jQuery.isArray( value ) ) {
			easing = value[ 1 ];
			value = props[ index ] = value[ 0 ];
		}

		if ( index !== name ) {
			props[ name ] = value;
			delete props[ index ];
		}

		hooks = jQuery.cssHooks[ name ];
		if ( hooks && "expand" in hooks ) {
			value = hooks.expand( value );
			delete props[ name ];

			// Not quite $.extend, this won't overwrite existing keys.
			// Reusing 'index' because we have the correct "name"
			for ( index in value ) {
				if ( !( index in props ) ) {
					props[ index ] = value[ index ];
					specialEasing[ index ] = easing;
				}
			}
		} else {
			specialEasing[ name ] = easing;
		}
	}
}

function Animation( elem, properties, options ) {
	var result,
		stopped,
		index = 0,
		length = animationPrefilters.length,
		deferred = jQuery.Deferred().always( function() {
			// Don't match elem in the :animated selector
			delete tick.elem;
		}),
		tick = function() {
			if ( stopped ) {
				return false;
			}
			var currentTime = fxNow || createFxNow(),
				remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),
				// Support: Android 2.3
				// Archaic crash bug won't allow us to use `1 - ( 0.5 || 0 )` (#12497)
				temp = remaining / animation.duration || 0,
				percent = 1 - temp,
				index = 0,
				length = animation.tweens.length;

			for ( ; index < length ; index++ ) {
				animation.tweens[ index ].run( percent );
			}

			deferred.notifyWith( elem, [ animation, percent, remaining ]);

			if ( percent < 1 && length ) {
				return remaining;
			} else {
				deferred.resolveWith( elem, [ animation ] );
				return false;
			}
		},
		animation = deferred.promise({
			elem: elem,
			props: jQuery.extend( {}, properties ),
			opts: jQuery.extend( true, { specialEasing: {} }, options ),
			originalProperties: properties,
			originalOptions: options,
			startTime: fxNow || createFxNow(),
			duration: options.duration,
			tweens: [],
			createTween: function( prop, end ) {
				var tween = jQuery.Tween( elem, animation.opts, prop, end,
						animation.opts.specialEasing[ prop ] || animation.opts.easing );
				animation.tweens.push( tween );
				return tween;
			},
			stop: function( gotoEnd ) {
				var index = 0,
					// If we are going to the end, we want to run all the tweens
					// otherwise we skip this part
					length = gotoEnd ? animation.tweens.length : 0;
				if ( stopped ) {
					return this;
				}
				stopped = true;
				for ( ; index < length ; index++ ) {
					animation.tweens[ index ].run( 1 );
				}

				// Resolve when we played the last frame; otherwise, reject
				if ( gotoEnd ) {
					deferred.resolveWith( elem, [ animation, gotoEnd ] );
				} else {
					deferred.rejectWith( elem, [ animation, gotoEnd ] );
				}
				return this;
			}
		}),
		props = animation.props;

	propFilter( props, animation.opts.specialEasing );

	for ( ; index < length ; index++ ) {
		result = animationPrefilters[ index ].call( animation, elem, props, animation.opts );
		if ( result ) {
			return result;
		}
	}

	jQuery.map( props, createTween, animation );

	if ( jQuery.isFunction( animation.opts.start ) ) {
		animation.opts.start.call( elem, animation );
	}

	jQuery.fx.timer(
		jQuery.extend( tick, {
			elem: elem,
			anim: animation,
			queue: animation.opts.queue
		})
	);

	// attach callbacks from options
	return animation.progress( animation.opts.progress )
		.done( animation.opts.done, animation.opts.complete )
		.fail( animation.opts.fail )
		.always( animation.opts.always );
}

jQuery.Animation = jQuery.extend( Animation, {

	tweener: function( props, callback ) {
		if ( jQuery.isFunction( props ) ) {
			callback = props;
			props = [ "*" ];
		} else {
			props = props.split(" ");
		}

		var prop,
			index = 0,
			length = props.length;

		for ( ; index < length ; index++ ) {
			prop = props[ index ];
			tweeners[ prop ] = tweeners[ prop ] || [];
			tweeners[ prop ].unshift( callback );
		}
	},

	prefilter: function( callback, prepend ) {
		if ( prepend ) {
			animationPrefilters.unshift( callback );
		} else {
			animationPrefilters.push( callback );
		}
	}
});

jQuery.speed = function( speed, easing, fn ) {
	var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
		complete: fn || !fn && easing ||
			jQuery.isFunction( speed ) && speed,
		duration: speed,
		easing: fn && easing || easing && !jQuery.isFunction( easing ) && easing
	};

	opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
		opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[ opt.duration ] : jQuery.fx.speeds._default;

	// Normalize opt.queue - true/undefined/null -> "fx"
	if ( opt.queue == null || opt.queue === true ) {
		opt.queue = "fx";
	}

	// Queueing
	opt.old = opt.complete;

	opt.complete = function() {
		if ( jQuery.isFunction( opt.old ) ) {
			opt.old.call( this );
		}

		if ( opt.queue ) {
			jQuery.dequeue( this, opt.queue );
		}
	};

	return opt;
};

jQuery.fn.extend({
	fadeTo: function( speed, to, easing, callback ) {

		// Show any hidden elements after setting opacity to 0
		return this.filter( isHidden ).css( "opacity", 0 ).show()

			// Animate to the value specified
			.end().animate({ opacity: to }, speed, easing, callback );
	},
	animate: function( prop, speed, easing, callback ) {
		var empty = jQuery.isEmptyObject( prop ),
			optall = jQuery.speed( speed, easing, callback ),
			doAnimation = function() {
				// Operate on a copy of prop so per-property easing won't be lost
				var anim = Animation( this, jQuery.extend( {}, prop ), optall );

				// Empty animations, or finishing resolves immediately
				if ( empty || data_priv.get( this, "finish" ) ) {
					anim.stop( true );
				}
			};
			doAnimation.finish = doAnimation;

		return empty || optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},
	stop: function( type, clearQueue, gotoEnd ) {
		var stopQueue = function( hooks ) {
			var stop = hooks.stop;
			delete hooks.stop;
			stop( gotoEnd );
		};

		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue && type !== false ) {
			this.queue( type || "fx", [] );
		}

		return this.each(function() {
			var dequeue = true,
				index = type != null && type + "queueHooks",
				timers = jQuery.timers,
				data = data_priv.get( this );

			if ( index ) {
				if ( data[ index ] && data[ index ].stop ) {
					stopQueue( data[ index ] );
				}
			} else {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
						stopQueue( data[ index ] );
					}
				}
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && (type == null || timers[ index ].queue === type) ) {
					timers[ index ].anim.stop( gotoEnd );
					dequeue = false;
					timers.splice( index, 1 );
				}
			}

			// Start the next in the queue if the last step wasn't forced.
			// Timers currently will call their complete callbacks, which
			// will dequeue but only if they were gotoEnd.
			if ( dequeue || !gotoEnd ) {
				jQuery.dequeue( this, type );
			}
		});
	},
	finish: function( type ) {
		if ( type !== false ) {
			type = type || "fx";
		}
		return this.each(function() {
			var index,
				data = data_priv.get( this ),
				queue = data[ type + "queue" ],
				hooks = data[ type + "queueHooks" ],
				timers = jQuery.timers,
				length = queue ? queue.length : 0;

			// Enable finishing flag on private data
			data.finish = true;

			// Empty the queue first
			jQuery.queue( this, type, [] );

			if ( hooks && hooks.stop ) {
				hooks.stop.call( this, true );
			}

			// Look for any active animations, and finish them
			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && timers[ index ].queue === type ) {
					timers[ index ].anim.stop( true );
					timers.splice( index, 1 );
				}
			}

			// Look for any animations in the old queue and finish them
			for ( index = 0; index < length; index++ ) {
				if ( queue[ index ] && queue[ index ].finish ) {
					queue[ index ].finish.call( this );
				}
			}

			// Turn off finishing flag
			delete data.finish;
		});
	}
});

jQuery.each([ "toggle", "show", "hide" ], function( i, name ) {
	var cssFn = jQuery.fn[ name ];
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return speed == null || typeof speed === "boolean" ?
			cssFn.apply( this, arguments ) :
			this.animate( genFx( name, true ), speed, easing, callback );
	};
});

// Generate shortcuts for custom animations
jQuery.each({
	slideDown: genFx("show"),
	slideUp: genFx("hide"),
	slideToggle: genFx("toggle"),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
});

jQuery.timers = [];
jQuery.fx.tick = function() {
	var timer,
		i = 0,
		timers = jQuery.timers;

	fxNow = jQuery.now();

	for ( ; i < timers.length; i++ ) {
		timer = timers[ i ];
		// Checks the timer has not already been removed
		if ( !timer() && timers[ i ] === timer ) {
			timers.splice( i--, 1 );
		}
	}

	if ( !timers.length ) {
		jQuery.fx.stop();
	}
	fxNow = undefined;
};

jQuery.fx.timer = function( timer ) {
	jQuery.timers.push( timer );
	if ( timer() ) {
		jQuery.fx.start();
	} else {
		jQuery.timers.pop();
	}
};

jQuery.fx.interval = 13;

jQuery.fx.start = function() {
	if ( !timerId ) {
		timerId = setInterval( jQuery.fx.tick, jQuery.fx.interval );
	}
};

jQuery.fx.stop = function() {
	clearInterval( timerId );
	timerId = null;
};

jQuery.fx.speeds = {
	slow: 600,
	fast: 200,
	// Default speed
	_default: 400
};


// Based off of the plugin by Clint Helfers, with permission.
// http://blindsignals.com/index.php/2009/07/jquery-delay/
jQuery.fn.delay = function( time, type ) {
	time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
	type = type || "fx";

	return this.queue( type, function( next, hooks ) {
		var timeout = setTimeout( next, time );
		hooks.stop = function() {
			clearTimeout( timeout );
		};
	});
};


(function() {
	var input = document.createElement( "input" ),
		select = document.createElement( "select" ),
		opt = select.appendChild( document.createElement( "option" ) );

	input.type = "checkbox";

	// Support: iOS<=5.1, Android<=4.2+
	// Default value for a checkbox should be "on"
	support.checkOn = input.value !== "";

	// Support: IE<=11+
	// Must access selectedIndex to make default options select
	support.optSelected = opt.selected;

	// Support: Android<=2.3
	// Options inside disabled selects are incorrectly marked as disabled
	select.disabled = true;
	support.optDisabled = !opt.disabled;

	// Support: IE<=11+
	// An input loses its value after becoming a radio
	input = document.createElement( "input" );
	input.value = "t";
	input.type = "radio";
	support.radioValue = input.value === "t";
})();


var nodeHook, boolHook,
	attrHandle = jQuery.expr.attrHandle;

jQuery.fn.extend({
	attr: function( name, value ) {
		return access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each(function() {
			jQuery.removeAttr( this, name );
		});
	}
});

jQuery.extend({
	attr: function( elem, name, value ) {
		var hooks, ret,
			nType = elem.nodeType;

		// don't get/set attributes on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === strundefined ) {
			return jQuery.prop( elem, name, value );
		}

		// All attributes are lowercase
		// Grab necessary hook if one is defined
		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {
			name = name.toLowerCase();
			hooks = jQuery.attrHooks[ name ] ||
				( jQuery.expr.match.bool.test( name ) ? boolHook : nodeHook );
		}

		if ( value !== undefined ) {

			if ( value === null ) {
				jQuery.removeAttr( elem, name );

			} else if ( hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ) {
				return ret;

			} else {
				elem.setAttribute( name, value + "" );
				return value;
			}

		} else if ( hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ) {
			return ret;

		} else {
			ret = jQuery.find.attr( elem, name );

			// Non-existent attributes return null, we normalize to undefined
			return ret == null ?
				undefined :
				ret;
		}
	},

	removeAttr: function( elem, value ) {
		var name, propName,
			i = 0,
			attrNames = value && value.match( rnotwhite );

		if ( attrNames && elem.nodeType === 1 ) {
			while ( (name = attrNames[i++]) ) {
				propName = jQuery.propFix[ name ] || name;

				// Boolean attributes get special treatment (#10870)
				if ( jQuery.expr.match.bool.test( name ) ) {
					// Set corresponding property to false
					elem[ propName ] = false;
				}

				elem.removeAttribute( name );
			}
		}
	},

	attrHooks: {
		type: {
			set: function( elem, value ) {
				if ( !support.radioValue && value === "radio" &&
					jQuery.nodeName( elem, "input" ) ) {
					var val = elem.value;
					elem.setAttribute( "type", value );
					if ( val ) {
						elem.value = val;
					}
					return value;
				}
			}
		}
	}
});

// Hooks for boolean attributes
boolHook = {
	set: function( elem, value, name ) {
		if ( value === false ) {
			// Remove boolean attributes when set to false
			jQuery.removeAttr( elem, name );
		} else {
			elem.setAttribute( name, name );
		}
		return name;
	}
};
jQuery.each( jQuery.expr.match.bool.source.match( /\w+/g ), function( i, name ) {
	var getter = attrHandle[ name ] || jQuery.find.attr;

	attrHandle[ name ] = function( elem, name, isXML ) {
		var ret, handle;
		if ( !isXML ) {
			// Avoid an infinite loop by temporarily removing this function from the getter
			handle = attrHandle[ name ];
			attrHandle[ name ] = ret;
			ret = getter( elem, name, isXML ) != null ?
				name.toLowerCase() :
				null;
			attrHandle[ name ] = handle;
		}
		return ret;
	};
});




var rfocusable = /^(?:input|select|textarea|button)$/i;

jQuery.fn.extend({
	prop: function( name, value ) {
		return access( this, jQuery.prop, name, value, arguments.length > 1 );
	},

	removeProp: function( name ) {
		return this.each(function() {
			delete this[ jQuery.propFix[ name ] || name ];
		});
	}
});

jQuery.extend({
	propFix: {
		"for": "htmlFor",
		"class": "className"
	},

	prop: function( elem, name, value ) {
		var ret, hooks, notxml,
			nType = elem.nodeType;

		// Don't get/set properties on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

		if ( notxml ) {
			// Fix name and attach hooks
			name = jQuery.propFix[ name ] || name;
			hooks = jQuery.propHooks[ name ];
		}

		if ( value !== undefined ) {
			return hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ?
				ret :
				( elem[ name ] = value );

		} else {
			return hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ?
				ret :
				elem[ name ];
		}
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {
				return elem.hasAttribute( "tabindex" ) || rfocusable.test( elem.nodeName ) || elem.href ?
					elem.tabIndex :
					-1;
			}
		}
	}
});

if ( !support.optSelected ) {
	jQuery.propHooks.selected = {
		get: function( elem ) {
			var parent = elem.parentNode;
			if ( parent && parent.parentNode ) {
				parent.parentNode.selectedIndex;
			}
			return null;
		}
	};
}

jQuery.each([
	"tabIndex",
	"readOnly",
	"maxLength",
	"cellSpacing",
	"cellPadding",
	"rowSpan",
	"colSpan",
	"useMap",
	"frameBorder",
	"contentEditable"
], function() {
	jQuery.propFix[ this.toLowerCase() ] = this;
});




var rclass = /[\t\r\n\f]/g;

jQuery.fn.extend({
	addClass: function( value ) {
		var classes, elem, cur, clazz, j, finalValue,
			proceed = typeof value === "string" && value,
			i = 0,
			len = this.length;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).addClass( value.call( this, j, this.className ) );
			});
		}

		if ( proceed ) {
			// The disjunction here is for better compressibility (see removeClass)
			classes = ( value || "" ).match( rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					" "
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						if ( cur.indexOf( " " + clazz + " " ) < 0 ) {
							cur += clazz + " ";
						}
					}

					// only assign if different to avoid unneeded rendering.
					finalValue = jQuery.trim( cur );
					if ( elem.className !== finalValue ) {
						elem.className = finalValue;
					}
				}
			}
		}

		return this;
	},

	removeClass: function( value ) {
		var classes, elem, cur, clazz, j, finalValue,
			proceed = arguments.length === 0 || typeof value === "string" && value,
			i = 0,
			len = this.length;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).removeClass( value.call( this, j, this.className ) );
			});
		}
		if ( proceed ) {
			classes = ( value || "" ).match( rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				// This expression is here for better compressibility (see addClass)
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					""
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						// Remove *all* instances
						while ( cur.indexOf( " " + clazz + " " ) >= 0 ) {
							cur = cur.replace( " " + clazz + " ", " " );
						}
					}

					// Only assign if different to avoid unneeded rendering.
					finalValue = value ? jQuery.trim( cur ) : "";
					if ( elem.className !== finalValue ) {
						elem.className = finalValue;
					}
				}
			}
		}

		return this;
	},

	toggleClass: function( value, stateVal ) {
		var type = typeof value;

		if ( typeof stateVal === "boolean" && type === "string" ) {
			return stateVal ? this.addClass( value ) : this.removeClass( value );
		}

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( i ) {
				jQuery( this ).toggleClass( value.call(this, i, this.className, stateVal), stateVal );
			});
		}

		return this.each(function() {
			if ( type === "string" ) {
				// Toggle individual class names
				var className,
					i = 0,
					self = jQuery( this ),
					classNames = value.match( rnotwhite ) || [];

				while ( (className = classNames[ i++ ]) ) {
					// Check each className given, space separated list
					if ( self.hasClass( className ) ) {
						self.removeClass( className );
					} else {
						self.addClass( className );
					}
				}

			// Toggle whole class name
			} else if ( type === strundefined || type === "boolean" ) {
				if ( this.className ) {
					// store className if set
					data_priv.set( this, "__className__", this.className );
				}

				// If the element has a class name or if we're passed `false`,
				// then remove the whole classname (if there was one, the above saved it).
				// Otherwise bring back whatever was previously saved (if anything),
				// falling back to the empty string if nothing was stored.
				this.className = this.className || value === false ? "" : data_priv.get( this, "__className__" ) || "";
			}
		});
	},

	hasClass: function( selector ) {
		var className = " " + selector + " ",
			i = 0,
			l = this.length;
		for ( ; i < l; i++ ) {
			if ( this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf( className ) >= 0 ) {
				return true;
			}
		}

		return false;
	}
});




var rreturn = /\r/g;

jQuery.fn.extend({
	val: function( value ) {
		var hooks, ret, isFunction,
			elem = this[0];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] || jQuery.valHooks[ elem.nodeName.toLowerCase() ];

				if ( hooks && "get" in hooks && (ret = hooks.get( elem, "value" )) !== undefined ) {
					return ret;
				}

				ret = elem.value;

				return typeof ret === "string" ?
					// Handle most common string cases
					ret.replace(rreturn, "") :
					// Handle cases where value is null/undef or number
					ret == null ? "" : ret;
			}

			return;
		}

		isFunction = jQuery.isFunction( value );

		return this.each(function( i ) {
			var val;

			if ( this.nodeType !== 1 ) {
				return;
			}

			if ( isFunction ) {
				val = value.call( this, i, jQuery( this ).val() );
			} else {
				val = value;
			}

			// Treat null/undefined as ""; convert numbers to string
			if ( val == null ) {
				val = "";

			} else if ( typeof val === "number" ) {
				val += "";

			} else if ( jQuery.isArray( val ) ) {
				val = jQuery.map( val, function( value ) {
					return value == null ? "" : value + "";
				});
			}

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

			// If set returns undefined, fall back to normal setting
			if ( !hooks || !("set" in hooks) || hooks.set( this, val, "value" ) === undefined ) {
				this.value = val;
			}
		});
	}
});

jQuery.extend({
	valHooks: {
		option: {
			get: function( elem ) {
				var val = jQuery.find.attr( elem, "value" );
				return val != null ?
					val :
					// Support: IE10-11+
					// option.text throws exceptions (#14686, #14858)
					jQuery.trim( jQuery.text( elem ) );
			}
		},
		select: {
			get: function( elem ) {
				var value, option,
					options = elem.options,
					index = elem.selectedIndex,
					one = elem.type === "select-one" || index < 0,
					values = one ? null : [],
					max = one ? index + 1 : options.length,
					i = index < 0 ?
						max :
						one ? index : 0;

				// Loop through all the selected options
				for ( ; i < max; i++ ) {
					option = options[ i ];

					// IE6-9 doesn't update selected after form reset (#2551)
					if ( ( option.selected || i === index ) &&
							// Don't return options that are disabled or in a disabled optgroup
							( support.optDisabled ? !option.disabled : option.getAttribute( "disabled" ) === null ) &&
							( !option.parentNode.disabled || !jQuery.nodeName( option.parentNode, "optgroup" ) ) ) {

						// Get the specific value for the option
						value = jQuery( option ).val();

						// We don't need an array for one selects
						if ( one ) {
							return value;
						}

						// Multi-Selects return an array
						values.push( value );
					}
				}

				return values;
			},

			set: function( elem, value ) {
				var optionSet, option,
					options = elem.options,
					values = jQuery.makeArray( value ),
					i = options.length;

				while ( i-- ) {
					option = options[ i ];
					if ( (option.selected = jQuery.inArray( option.value, values ) >= 0) ) {
						optionSet = true;
					}
				}

				// Force browsers to behave consistently when non-matching value is set
				if ( !optionSet ) {
					elem.selectedIndex = -1;
				}
				return values;
			}
		}
	}
});

// Radios and checkboxes getter/setter
jQuery.each([ "radio", "checkbox" ], function() {
	jQuery.valHooks[ this ] = {
		set: function( elem, value ) {
			if ( jQuery.isArray( value ) ) {
				return ( elem.checked = jQuery.inArray( jQuery(elem).val(), value ) >= 0 );
			}
		}
	};
	if ( !support.checkOn ) {
		jQuery.valHooks[ this ].get = function( elem ) {
			return elem.getAttribute("value") === null ? "on" : elem.value;
		};
	}
});




// Return jQuery for attributes-only inclusion


jQuery.each( ("blur focus focusin focusout load resize scroll unload click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup error contextmenu").split(" "), function( i, name ) {

	// Handle event binding
	jQuery.fn[ name ] = function( data, fn ) {
		return arguments.length > 0 ?
			this.on( name, null, data, fn ) :
			this.trigger( name );
	};
});

jQuery.fn.extend({
	hover: function( fnOver, fnOut ) {
		return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
	},

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {
		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length === 1 ? this.off( selector, "**" ) : this.off( types, selector || "**", fn );
	}
});


var nonce = jQuery.now();

var rquery = (/\?/);



// Support: Android 2.3
// Workaround failure to string-cast null input
jQuery.parseJSON = function( data ) {
	return JSON.parse( data + "" );
};


// Cross-browser xml parsing
jQuery.parseXML = function( data ) {
	var xml, tmp;
	if ( !data || typeof data !== "string" ) {
		return null;
	}

	// Support: IE9
	try {
		tmp = new DOMParser();
		xml = tmp.parseFromString( data, "text/xml" );
	} catch ( e ) {
		xml = undefined;
	}

	if ( !xml || xml.getElementsByTagName( "parsererror" ).length ) {
		jQuery.error( "Invalid XML: " + data );
	}
	return xml;
};


var
	rhash = /#.*$/,
	rts = /([?&])_=[^&]*/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)$/mg,
	// #7653, #8125, #8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
	rnoContent = /^(?:GET|HEAD)$/,
	rprotocol = /^\/\//,
	rurl = /^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,

	/* Prefilters
	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
	 * 2) These are called:
	 *    - BEFORE asking for a transport
	 *    - AFTER param serialization (s.data is a string if s.processData is true)
	 * 3) key is the dataType
	 * 4) the catchall symbol "*" can be used
	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
	 */
	prefilters = {},

	/* Transports bindings
	 * 1) key is the dataType
	 * 2) the catchall symbol "*" can be used
	 * 3) selection will start with transport dataType and THEN go to "*" if needed
	 */
	transports = {},

	// Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
	allTypes = "*/".concat( "*" ),

	// Document location
	ajaxLocation = window.location.href,

	// Segment location into parts
	ajaxLocParts = rurl.exec( ajaxLocation.toLowerCase() ) || [];

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

	// dataTypeExpression is optional and defaults to "*"
	return function( dataTypeExpression, func ) {

		if ( typeof dataTypeExpression !== "string" ) {
			func = dataTypeExpression;
			dataTypeExpression = "*";
		}

		var dataType,
			i = 0,
			dataTypes = dataTypeExpression.toLowerCase().match( rnotwhite ) || [];

		if ( jQuery.isFunction( func ) ) {
			// For each dataType in the dataTypeExpression
			while ( (dataType = dataTypes[i++]) ) {
				// Prepend if requested
				if ( dataType[0] === "+" ) {
					dataType = dataType.slice( 1 ) || "*";
					(structure[ dataType ] = structure[ dataType ] || []).unshift( func );

				// Otherwise append
				} else {
					(structure[ dataType ] = structure[ dataType ] || []).push( func );
				}
			}
		}
	};
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR ) {

	var inspected = {},
		seekingTransport = ( structure === transports );

	function inspect( dataType ) {
		var selected;
		inspected[ dataType ] = true;
		jQuery.each( structure[ dataType ] || [], function( _, prefilterOrFactory ) {
			var dataTypeOrTransport = prefilterOrFactory( options, originalOptions, jqXHR );
			if ( typeof dataTypeOrTransport === "string" && !seekingTransport && !inspected[ dataTypeOrTransport ] ) {
				options.dataTypes.unshift( dataTypeOrTransport );
				inspect( dataTypeOrTransport );
				return false;
			} else if ( seekingTransport ) {
				return !( selected = dataTypeOrTransport );
			}
		});
		return selected;
	}

	return inspect( options.dataTypes[ 0 ] ) || !inspected[ "*" ] && inspect( "*" );
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
	var key, deep,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};

	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || (deep = {}) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}

	return target;
}

/* Handles responses to an ajax request:
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {

	var ct, type, finalDataType, firstDataType,
		contents = s.contents,
		dataTypes = s.dataTypes;

	// Remove auto dataType and get content-type in the process
	while ( dataTypes[ 0 ] === "*" ) {
		dataTypes.shift();
		if ( ct === undefined ) {
			ct = s.mimeType || jqXHR.getResponseHeader("Content-Type");
		}
	}

	// Check if we're dealing with a known content-type
	if ( ct ) {
		for ( type in contents ) {
			if ( contents[ type ] && contents[ type ].test( ct ) ) {
				dataTypes.unshift( type );
				break;
			}
		}
	}

	// Check to see if we have a response for the expected dataType
	if ( dataTypes[ 0 ] in responses ) {
		finalDataType = dataTypes[ 0 ];
	} else {
		// Try convertible dataTypes
		for ( type in responses ) {
			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[0] ] ) {
				finalDataType = type;
				break;
			}
			if ( !firstDataType ) {
				firstDataType = type;
			}
		}
		// Or just use first one
		finalDataType = finalDataType || firstDataType;
	}

	// If we found a dataType
	// We add the dataType to the list if needed
	// and return the corresponding response
	if ( finalDataType ) {
		if ( finalDataType !== dataTypes[ 0 ] ) {
			dataTypes.unshift( finalDataType );
		}
		return responses[ finalDataType ];
	}
}

/* Chain conversions given the request and the original response
 * Also sets the responseXXX fields on the jqXHR instance
 */
function ajaxConvert( s, response, jqXHR, isSuccess ) {
	var conv2, current, conv, tmp, prev,
		converters = {},
		// Work with a copy of dataTypes in case we need to modify it for conversion
		dataTypes = s.dataTypes.slice();

	// Create converters map with lowercased keys
	if ( dataTypes[ 1 ] ) {
		for ( conv in s.converters ) {
			converters[ conv.toLowerCase() ] = s.converters[ conv ];
		}
	}

	current = dataTypes.shift();

	// Convert to each sequential dataType
	while ( current ) {

		if ( s.responseFields[ current ] ) {
			jqXHR[ s.responseFields[ current ] ] = response;
		}

		// Apply the dataFilter if provided
		if ( !prev && isSuccess && s.dataFilter ) {
			response = s.dataFilter( response, s.dataType );
		}

		prev = current;
		current = dataTypes.shift();

		if ( current ) {

		// There's only work to do if current dataType is non-auto
			if ( current === "*" ) {

				current = prev;

			// Convert response if prev dataType is non-auto and differs from current
			} else if ( prev !== "*" && prev !== current ) {

				// Seek a direct converter
				conv = converters[ prev + " " + current ] || converters[ "* " + current ];

				// If none found, seek a pair
				if ( !conv ) {
					for ( conv2 in converters ) {

						// If conv2 outputs current
						tmp = conv2.split( " " );
						if ( tmp[ 1 ] === current ) {

							// If prev can be converted to accepted input
							conv = converters[ prev + " " + tmp[ 0 ] ] ||
								converters[ "* " + tmp[ 0 ] ];
							if ( conv ) {
								// Condense equivalence converters
								if ( conv === true ) {
									conv = converters[ conv2 ];

								// Otherwise, insert the intermediate dataType
								} else if ( converters[ conv2 ] !== true ) {
									current = tmp[ 0 ];
									dataTypes.unshift( tmp[ 1 ] );
								}
								break;
							}
						}
					}
				}

				// Apply converter (if not an equivalence)
				if ( conv !== true ) {

					// Unless errors are allowed to bubble, catch and return them
					if ( conv && s[ "throws" ] ) {
						response = conv( response );
					} else {
						try {
							response = conv( response );
						} catch ( e ) {
							return { state: "parsererror", error: conv ? e : "No conversion from " + prev + " to " + current };
						}
					}
				}
			}
		}
	}

	return { state: "success", data: response };
}

jQuery.extend({

	// Counter for holding the number of active queries
	active: 0,

	// Last-Modified header cache for next request
	lastModified: {},
	etag: {},

	ajaxSettings: {
		url: ajaxLocation,
		type: "GET",
		isLocal: rlocalProtocol.test( ajaxLocParts[ 1 ] ),
		global: true,
		processData: true,
		async: true,
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",
		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			"*": allTypes,
			text: "text/plain",
			html: "text/html",
			xml: "application/xml, text/xml",
			json: "application/json, text/javascript"
		},

		contents: {
			xml: /xml/,
			html: /html/,
			json: /json/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText",
			json: "responseJSON"
		},

		// Data converters
		// Keys separate source (or catchall "*") and destination types with a single space
		converters: {

			// Convert anything to text
			"* text": String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": jQuery.parseJSON,

			// Parse text as xml
			"text xml": jQuery.parseXML
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			url: true,
			context: true
		}
	},

	// Creates a full fledged settings object into target
	// with both ajaxSettings and settings fields.
	// If target is omitted, writes into ajaxSettings.
	ajaxSetup: function( target, settings ) {
		return settings ?

			// Building a settings object
			ajaxExtend( ajaxExtend( target, jQuery.ajaxSettings ), settings ) :

			// Extending ajaxSettings
			ajaxExtend( jQuery.ajaxSettings, target );
	},

	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
	ajaxTransport: addToPrefiltersOrTransports( transports ),

	// Main method
	ajax: function( url, options ) {

		// If url is an object, simulate pre-1.5 signature
		if ( typeof url === "object" ) {
			options = url;
			url = undefined;
		}

		// Force options to be an object
		options = options || {};

		var transport,
			// URL without anti-cache param
			cacheURL,
			// Response headers
			responseHeadersString,
			responseHeaders,
			// timeout handle
			timeoutTimer,
			// Cross-domain detection vars
			parts,
			// To know if global events are to be dispatched
			fireGlobals,
			// Loop variable
			i,
			// Create the final options object
			s = jQuery.ajaxSetup( {}, options ),
			// Callbacks context
			callbackContext = s.context || s,
			// Context for global events is callbackContext if it is a DOM node or jQuery collection
			globalEventContext = s.context && ( callbackContext.nodeType || callbackContext.jquery ) ?
				jQuery( callbackContext ) :
				jQuery.event,
			// Deferreds
			deferred = jQuery.Deferred(),
			completeDeferred = jQuery.Callbacks("once memory"),
			// Status-dependent callbacks
			statusCode = s.statusCode || {},
			// Headers (they are sent all at once)
			requestHeaders = {},
			requestHeadersNames = {},
			// The jqXHR state
			state = 0,
			// Default abort message
			strAbort = "canceled",
			// Fake xhr
			jqXHR = {
				readyState: 0,

				// Builds headers hashtable if needed
				getResponseHeader: function( key ) {
					var match;
					if ( state === 2 ) {
						if ( !responseHeaders ) {
							responseHeaders = {};
							while ( (match = rheaders.exec( responseHeadersString )) ) {
								responseHeaders[ match[1].toLowerCase() ] = match[ 2 ];
							}
						}
						match = responseHeaders[ key.toLowerCase() ];
					}
					return match == null ? null : match;
				},

				// Raw string
				getAllResponseHeaders: function() {
					return state === 2 ? responseHeadersString : null;
				},

				// Caches the header
				setRequestHeader: function( name, value ) {
					var lname = name.toLowerCase();
					if ( !state ) {
						name = requestHeadersNames[ lname ] = requestHeadersNames[ lname ] || name;
						requestHeaders[ name ] = value;
					}
					return this;
				},

				// Overrides response content-type header
				overrideMimeType: function( type ) {
					if ( !state ) {
						s.mimeType = type;
					}
					return this;
				},

				// Status-dependent callbacks
				statusCode: function( map ) {
					var code;
					if ( map ) {
						if ( state < 2 ) {
							for ( code in map ) {
								// Lazy-add the new callback in a way that preserves old ones
								statusCode[ code ] = [ statusCode[ code ], map[ code ] ];
							}
						} else {
							// Execute the appropriate callbacks
							jqXHR.always( map[ jqXHR.status ] );
						}
					}
					return this;
				},

				// Cancel the request
				abort: function( statusText ) {
					var finalText = statusText || strAbort;
					if ( transport ) {
						transport.abort( finalText );
					}
					done( 0, finalText );
					return this;
				}
			};

		// Attach deferreds
		deferred.promise( jqXHR ).complete = completeDeferred.add;
		jqXHR.success = jqXHR.done;
		jqXHR.error = jqXHR.fail;

		// Remove hash character (#7531: and string promotion)
		// Add protocol if not provided (prefilters might expect it)
		// Handle falsy url in the settings object (#10093: consistency with old signature)
		// We also use the url parameter if available
		s.url = ( ( url || s.url || ajaxLocation ) + "" ).replace( rhash, "" )
			.replace( rprotocol, ajaxLocParts[ 1 ] + "//" );

		// Alias method option to type as per ticket #12004
		s.type = options.method || options.type || s.method || s.type;

		// Extract dataTypes list
		s.dataTypes = jQuery.trim( s.dataType || "*" ).toLowerCase().match( rnotwhite ) || [ "" ];

		// A cross-domain request is in order when we have a protocol:host:port mismatch
		if ( s.crossDomain == null ) {
			parts = rurl.exec( s.url.toLowerCase() );
			s.crossDomain = !!( parts &&
				( parts[ 1 ] !== ajaxLocParts[ 1 ] || parts[ 2 ] !== ajaxLocParts[ 2 ] ||
					( parts[ 3 ] || ( parts[ 1 ] === "http:" ? "80" : "443" ) ) !==
						( ajaxLocParts[ 3 ] || ( ajaxLocParts[ 1 ] === "http:" ? "80" : "443" ) ) )
			);
		}

		// Convert data if not already a string
		if ( s.data && s.processData && typeof s.data !== "string" ) {
			s.data = jQuery.param( s.data, s.traditional );
		}

		// Apply prefilters
		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

		// If request was aborted inside a prefilter, stop there
		if ( state === 2 ) {
			return jqXHR;
		}

		// We can fire global events as of now if asked to
		// Don't fire events if jQuery.event is undefined in an AMD-usage scenario (#15118)
		fireGlobals = jQuery.event && s.global;

		// Watch for a new set of requests
		if ( fireGlobals && jQuery.active++ === 0 ) {
			jQuery.event.trigger("ajaxStart");
		}

		// Uppercase the type
		s.type = s.type.toUpperCase();

		// Determine if request has content
		s.hasContent = !rnoContent.test( s.type );

		// Save the URL in case we're toying with the If-Modified-Since
		// and/or If-None-Match header later on
		cacheURL = s.url;

		// More options handling for requests with no content
		if ( !s.hasContent ) {

			// If data is available, append data to url
			if ( s.data ) {
				cacheURL = ( s.url += ( rquery.test( cacheURL ) ? "&" : "?" ) + s.data );
				// #9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Add anti-cache in url if needed
			if ( s.cache === false ) {
				s.url = rts.test( cacheURL ) ?

					// If there is already a '_' parameter, set its value
					cacheURL.replace( rts, "$1_=" + nonce++ ) :

					// Otherwise add one to the end
					cacheURL + ( rquery.test( cacheURL ) ? "&" : "?" ) + "_=" + nonce++;
			}
		}

		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
		if ( s.ifModified ) {
			if ( jQuery.lastModified[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ cacheURL ] );
			}
			if ( jQuery.etag[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ cacheURL ] );
			}
		}

		// Set the correct header, if data is being sent
		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
			jqXHR.setRequestHeader( "Content-Type", s.contentType );
		}

		// Set the Accepts header for the server, depending on the dataType
		jqXHR.setRequestHeader(
			"Accept",
			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[0] ] ?
				s.accepts[ s.dataTypes[0] ] + ( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
				s.accepts[ "*" ]
		);

		// Check for headers option
		for ( i in s.headers ) {
			jqXHR.setRequestHeader( i, s.headers[ i ] );
		}

		// Allow custom headers/mimetypes and early abort
		if ( s.beforeSend && ( s.beforeSend.call( callbackContext, jqXHR, s ) === false || state === 2 ) ) {
			// Abort if not done already and return
			return jqXHR.abort();
		}

		// Aborting is no longer a cancellation
		strAbort = "abort";

		// Install callbacks on deferreds
		for ( i in { success: 1, error: 1, complete: 1 } ) {
			jqXHR[ i ]( s[ i ] );
		}

		// Get transport
		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

		// If no transport, we auto-abort
		if ( !transport ) {
			done( -1, "No Transport" );
		} else {
			jqXHR.readyState = 1;

			// Send global event
			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
			}
			// Timeout
			if ( s.async && s.timeout > 0 ) {
				timeoutTimer = setTimeout(function() {
					jqXHR.abort("timeout");
				}, s.timeout );
			}

			try {
				state = 1;
				transport.send( requestHeaders, done );
			} catch ( e ) {
				// Propagate exception as error if not done
				if ( state < 2 ) {
					done( -1, e );
				// Simply rethrow otherwise
				} else {
					throw e;
				}
			}
		}

		// Callback for when everything is done
		function done( status, nativeStatusText, responses, headers ) {
			var isSuccess, success, error, response, modified,
				statusText = nativeStatusText;

			// Called once
			if ( state === 2 ) {
				return;
			}

			// State is "done" now
			state = 2;

			// Clear timeout if it exists
			if ( timeoutTimer ) {
				clearTimeout( timeoutTimer );
			}

			// Dereference transport for early garbage collection
			// (no matter how long the jqXHR object will be used)
			transport = undefined;

			// Cache response headers
			responseHeadersString = headers || "";

			// Set readyState
			jqXHR.readyState = status > 0 ? 4 : 0;

			// Determine if successful
			isSuccess = status >= 200 && status < 300 || status === 304;

			// Get response data
			if ( responses ) {
				response = ajaxHandleResponses( s, jqXHR, responses );
			}

			// Convert no matter what (that way responseXXX fields are always set)
			response = ajaxConvert( s, response, jqXHR, isSuccess );

			// If successful, handle type chaining
			if ( isSuccess ) {

				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
				if ( s.ifModified ) {
					modified = jqXHR.getResponseHeader("Last-Modified");
					if ( modified ) {
						jQuery.lastModified[ cacheURL ] = modified;
					}
					modified = jqXHR.getResponseHeader("etag");
					if ( modified ) {
						jQuery.etag[ cacheURL ] = modified;
					}
				}

				// if no content
				if ( status === 204 || s.type === "HEAD" ) {
					statusText = "nocontent";

				// if not modified
				} else if ( status === 304 ) {
					statusText = "notmodified";

				// If we have data, let's convert it
				} else {
					statusText = response.state;
					success = response.data;
					error = response.error;
					isSuccess = !error;
				}
			} else {
				// Extract error from statusText and normalize for non-aborts
				error = statusText;
				if ( status || !statusText ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = ( nativeStatusText || statusText ) + "";

			// Success/Error
			if ( isSuccess ) {
				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
			} else {
				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
			}

			// Status-dependent callbacks
			jqXHR.statusCode( statusCode );
			statusCode = undefined;

			if ( fireGlobals ) {
				globalEventContext.trigger( isSuccess ? "ajaxSuccess" : "ajaxError",
					[ jqXHR, s, isSuccess ? success : error ] );
			}

			// Complete
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );
				// Handle the global AJAX counter
				if ( !( --jQuery.active ) ) {
					jQuery.event.trigger("ajaxStop");
				}
			}
		}

		return jqXHR;
	},

	getJSON: function( url, data, callback ) {
		return jQuery.get( url, data, callback, "json" );
	},

	getScript: function( url, callback ) {
		return jQuery.get( url, undefined, callback, "script" );
	}
});

jQuery.each( [ "get", "post" ], function( i, method ) {
	jQuery[ method ] = function( url, data, callback, type ) {
		// Shift arguments if data argument was omitted
		if ( jQuery.isFunction( data ) ) {
			type = type || callback;
			callback = data;
			data = undefined;
		}

		return jQuery.ajax({
			url: url,
			type: method,
			dataType: type,
			data: data,
			success: callback
		});
	};
});


jQuery._evalUrl = function( url ) {
	return jQuery.ajax({
		url: url,
		type: "GET",
		dataType: "script",
		async: false,
		global: false,
		"throws": true
	});
};


jQuery.fn.extend({
	wrapAll: function( html ) {
		var wrap;

		if ( jQuery.isFunction( html ) ) {
			return this.each(function( i ) {
				jQuery( this ).wrapAll( html.call(this, i) );
			});
		}

		if ( this[ 0 ] ) {

			// The elements to wrap the target around
			wrap = jQuery( html, this[ 0 ].ownerDocument ).eq( 0 ).clone( true );

			if ( this[ 0 ].parentNode ) {
				wrap.insertBefore( this[ 0 ] );
			}

			wrap.map(function() {
				var elem = this;

				while ( elem.firstElementChild ) {
					elem = elem.firstElementChild;
				}

				return elem;
			}).append( this );
		}

		return this;
	},

	wrapInner: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function( i ) {
				jQuery( this ).wrapInner( html.call(this, i) );
			});
		}

		return this.each(function() {
			var self = jQuery( this ),
				contents = self.contents();

			if ( contents.length ) {
				contents.wrapAll( html );

			} else {
				self.append( html );
			}
		});
	},

	wrap: function( html ) {
		var isFunction = jQuery.isFunction( html );

		return this.each(function( i ) {
			jQuery( this ).wrapAll( isFunction ? html.call(this, i) : html );
		});
	},

	unwrap: function() {
		return this.parent().each(function() {
			if ( !jQuery.nodeName( this, "body" ) ) {
				jQuery( this ).replaceWith( this.childNodes );
			}
		}).end();
	}
});


jQuery.expr.filters.hidden = function( elem ) {
	// Support: Opera <= 12.12
	// Opera reports offsetWidths and offsetHeights less than zero on some elements
	return elem.offsetWidth <= 0 && elem.offsetHeight <= 0;
};
jQuery.expr.filters.visible = function( elem ) {
	return !jQuery.expr.filters.hidden( elem );
};




var r20 = /%20/g,
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
	rsubmittable = /^(?:input|select|textarea|keygen)/i;

function buildParams( prefix, obj, traditional, add ) {
	var name;

	if ( jQuery.isArray( obj ) ) {
		// Serialize array item.
		jQuery.each( obj, function( i, v ) {
			if ( traditional || rbracket.test( prefix ) ) {
				// Treat each array item as a scalar.
				add( prefix, v );

			} else {
				// Item is non-scalar (array or object), encode its numeric index.
				buildParams( prefix + "[" + ( typeof v === "object" ? i : "" ) + "]", v, traditional, add );
			}
		});

	} else if ( !traditional && jQuery.type( obj ) === "object" ) {
		// Serialize object item.
		for ( name in obj ) {
			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
		}

	} else {
		// Serialize scalar item.
		add( prefix, obj );
	}
}

// Serialize an array of form elements or a set of
// key/values into a query string
jQuery.param = function( a, traditional ) {
	var prefix,
		s = [],
		add = function( key, value ) {
			// If value is a function, invoke it and return its value
			value = jQuery.isFunction( value ) ? value() : ( value == null ? "" : value );
			s[ s.length ] = encodeURIComponent( key ) + "=" + encodeURIComponent( value );
		};

	// Set traditional to true for jQuery <= 1.3.2 behavior.
	if ( traditional === undefined ) {
		traditional = jQuery.ajaxSettings && jQuery.ajaxSettings.traditional;
	}

	// If an array was passed in, assume that it is an array of form elements.
	if ( jQuery.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {
		// Serialize the form elements
		jQuery.each( a, function() {
			add( this.name, this.value );
		});

	} else {
		// If traditional, encode the "old" way (the way 1.3.2 or older
		// did it), otherwise encode params recursively.
		for ( prefix in a ) {
			buildParams( prefix, a[ prefix ], traditional, add );
		}
	}

	// Return the resulting serialization
	return s.join( "&" ).replace( r20, "+" );
};

jQuery.fn.extend({
	serialize: function() {
		return jQuery.param( this.serializeArray() );
	},
	serializeArray: function() {
		return this.map(function() {
			// Can add propHook for "elements" to filter or add form elements
			var elements = jQuery.prop( this, "elements" );
			return elements ? jQuery.makeArray( elements ) : this;
		})
		.filter(function() {
			var type = this.type;

			// Use .is( ":disabled" ) so that fieldset[disabled] works
			return this.name && !jQuery( this ).is( ":disabled" ) &&
				rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
				( this.checked || !rcheckableType.test( type ) );
		})
		.map(function( i, elem ) {
			var val = jQuery( this ).val();

			return val == null ?
				null :
				jQuery.isArray( val ) ?
					jQuery.map( val, function( val ) {
						return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
					}) :
					{ name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
		}).get();
	}
});


jQuery.ajaxSettings.xhr = function() {
	try {
		return new XMLHttpRequest();
	} catch( e ) {}
};

var xhrId = 0,
	xhrCallbacks = {},
	xhrSuccessStatus = {
		// file protocol always yields status code 0, assume 200
		0: 200,
		// Support: IE9
		// #1450: sometimes IE returns 1223 when it should be 204
		1223: 204
	},
	xhrSupported = jQuery.ajaxSettings.xhr();

// Support: IE9
// Open requests must be manually aborted on unload (#5280)
// See https://support.microsoft.com/kb/2856746 for more info
if ( window.attachEvent ) {
	window.attachEvent( "onunload", function() {
		for ( var key in xhrCallbacks ) {
			xhrCallbacks[ key ]();
		}
	});
}

support.cors = !!xhrSupported && ( "withCredentials" in xhrSupported );
support.ajax = xhrSupported = !!xhrSupported;

jQuery.ajaxTransport(function( options ) {
	var callback;

	// Cross domain only allowed if supported through XMLHttpRequest
	if ( support.cors || xhrSupported && !options.crossDomain ) {
		return {
			send: function( headers, complete ) {
				var i,
					xhr = options.xhr(),
					id = ++xhrId;

				xhr.open( options.type, options.url, options.async, options.username, options.password );

				// Apply custom fields if provided
				if ( options.xhrFields ) {
					for ( i in options.xhrFields ) {
						xhr[ i ] = options.xhrFields[ i ];
					}
				}

				// Override mime type if needed
				if ( options.mimeType && xhr.overrideMimeType ) {
					xhr.overrideMimeType( options.mimeType );
				}

				// X-Requested-With header
				// For cross-domain requests, seeing as conditions for a preflight are
				// akin to a jigsaw puzzle, we simply never set it to be sure.
				// (it can always be set on a per-request basis or even using ajaxSetup)
				// For same-domain requests, won't change header if already provided.
				if ( !options.crossDomain && !headers["X-Requested-With"] ) {
					headers["X-Requested-With"] = "XMLHttpRequest";
				}

				// Set headers
				for ( i in headers ) {
					xhr.setRequestHeader( i, headers[ i ] );
				}

				// Callback
				callback = function( type ) {
					return function() {
						if ( callback ) {
							delete xhrCallbacks[ id ];
							callback = xhr.onload = xhr.onerror = null;

							if ( type === "abort" ) {
								xhr.abort();
							} else if ( type === "error" ) {
								complete(
									// file: protocol always yields status 0; see #8605, #14207
									xhr.status,
									xhr.statusText
								);
							} else {
								complete(
									xhrSuccessStatus[ xhr.status ] || xhr.status,
									xhr.statusText,
									// Support: IE9
									// Accessing binary-data responseText throws an exception
									// (#11426)
									typeof xhr.responseText === "string" ? {
										text: xhr.responseText
									} : undefined,
									xhr.getAllResponseHeaders()
								);
							}
						}
					};
				};

				// Listen to events
				xhr.onload = callback();
				xhr.onerror = callback("error");

				// Create the abort callback
				callback = xhrCallbacks[ id ] = callback("abort");

				try {
					// Do send the request (this may raise an exception)
					xhr.send( options.hasContent && options.data || null );
				} catch ( e ) {
					// #14683: Only rethrow if this hasn't been notified as an error yet
					if ( callback ) {
						throw e;
					}
				}
			},

			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
});




// Install script dataType
jQuery.ajaxSetup({
	accepts: {
		script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"
	},
	contents: {
		script: /(?:java|ecma)script/
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
});

// Handle cache's special case and crossDomain
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}
	if ( s.crossDomain ) {
		s.type = "GET";
	}
});

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function( s ) {
	// This transport only deals with cross domain requests
	if ( s.crossDomain ) {
		var script, callback;
		return {
			send: function( _, complete ) {
				script = jQuery("<script>").prop({
					async: true,
					charset: s.scriptCharset,
					src: s.url
				}).on(
					"load error",
					callback = function( evt ) {
						script.remove();
						callback = null;
						if ( evt ) {
							complete( evt.type === "error" ? 404 : 200, evt.type );
						}
					}
				);
				document.head.appendChild( script[ 0 ] );
			},
			abort: function() {
				if ( callback ) {
					callback();
				}
			}
		};
	}
});




var oldCallbacks = [],
	rjsonp = /(=)\?(?=&|$)|\?\?/;

// Default jsonp settings
jQuery.ajaxSetup({
	jsonp: "callback",
	jsonpCallback: function() {
		var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( nonce++ ) );
		this[ callback ] = true;
		return callback;
	}
});

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

	var callbackName, overwritten, responseContainer,
		jsonProp = s.jsonp !== false && ( rjsonp.test( s.url ) ?
			"url" :
			typeof s.data === "string" && !( s.contentType || "" ).indexOf("application/x-www-form-urlencoded") && rjsonp.test( s.data ) && "data"
		);

	// Handle iff the expected data type is "jsonp" or we have a parameter to set
	if ( jsonProp || s.dataTypes[ 0 ] === "jsonp" ) {

		// Get callback name, remembering preexisting value associated with it
		callbackName = s.jsonpCallback = jQuery.isFunction( s.jsonpCallback ) ?
			s.jsonpCallback() :
			s.jsonpCallback;

		// Insert callback into url or form data
		if ( jsonProp ) {
			s[ jsonProp ] = s[ jsonProp ].replace( rjsonp, "$1" + callbackName );
		} else if ( s.jsonp !== false ) {
			s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
		}

		// Use data converter to retrieve json after script execution
		s.converters["script json"] = function() {
			if ( !responseContainer ) {
				jQuery.error( callbackName + " was not called" );
			}
			return responseContainer[ 0 ];
		};

		// force json dataType
		s.dataTypes[ 0 ] = "json";

		// Install callback
		overwritten = window[ callbackName ];
		window[ callbackName ] = function() {
			responseContainer = arguments;
		};

		// Clean-up function (fires after converters)
		jqXHR.always(function() {
			// Restore preexisting value
			window[ callbackName ] = overwritten;

			// Save back as free
			if ( s[ callbackName ] ) {
				// make sure that re-using the options doesn't screw things around
				s.jsonpCallback = originalSettings.jsonpCallback;

				// save the callback name for future use
				oldCallbacks.push( callbackName );
			}

			// Call if it was a function and we have a response
			if ( responseContainer && jQuery.isFunction( overwritten ) ) {
				overwritten( responseContainer[ 0 ] );
			}

			responseContainer = overwritten = undefined;
		});

		// Delegate to script
		return "script";
	}
});




// data: string of html
// context (optional): If specified, the fragment will be created in this context, defaults to document
// keepScripts (optional): If true, will include scripts passed in the html string
jQuery.parseHTML = function( data, context, keepScripts ) {
	if ( !data || typeof data !== "string" ) {
		return null;
	}
	if ( typeof context === "boolean" ) {
		keepScripts = context;
		context = false;
	}
	context = context || document;

	var parsed = rsingleTag.exec( data ),
		scripts = !keepScripts && [];

	// Single tag
	if ( parsed ) {
		return [ context.createElement( parsed[1] ) ];
	}

	parsed = jQuery.buildFragment( [ data ], context, scripts );

	if ( scripts && scripts.length ) {
		jQuery( scripts ).remove();
	}

	return jQuery.merge( [], parsed.childNodes );
};


// Keep a copy of the old load method
var _load = jQuery.fn.load;

/**
 * Load a url into a page
 */
jQuery.fn.load = function( url, params, callback ) {
	if ( typeof url !== "string" && _load ) {
		return _load.apply( this, arguments );
	}

	var selector, type, response,
		self = this,
		off = url.indexOf(" ");

	if ( off >= 0 ) {
		selector = jQuery.trim( url.slice( off ) );
		url = url.slice( 0, off );
	}

	// If it's a function
	if ( jQuery.isFunction( params ) ) {

		// We assume that it's the callback
		callback = params;
		params = undefined;

	// Otherwise, build a param string
	} else if ( params && typeof params === "object" ) {
		type = "POST";
	}

	// If we have elements to modify, make the request
	if ( self.length > 0 ) {
		jQuery.ajax({
			url: url,

			// if "type" variable is undefined, then "GET" method will be used
			type: type,
			dataType: "html",
			data: params
		}).done(function( responseText ) {

			// Save response for use in complete callback
			response = arguments;

			self.html( selector ?

				// If a selector was specified, locate the right elements in a dummy div
				// Exclude scripts to avoid IE 'Permission Denied' errors
				jQuery("<div>").append( jQuery.parseHTML( responseText ) ).find( selector ) :

				// Otherwise use the full result
				responseText );

		}).complete( callback && function( jqXHR, status ) {
			self.each( callback, response || [ jqXHR.responseText, status, jqXHR ] );
		});
	}

	return this;
};




// Attach a bunch of functions for handling common AJAX events
jQuery.each( [ "ajaxStart", "ajaxStop", "ajaxComplete", "ajaxError", "ajaxSuccess", "ajaxSend" ], function( i, type ) {
	jQuery.fn[ type ] = function( fn ) {
		return this.on( type, fn );
	};
});




jQuery.expr.filters.animated = function( elem ) {
	return jQuery.grep(jQuery.timers, function( fn ) {
		return elem === fn.elem;
	}).length;
};




var docElem = window.document.documentElement;

/**
 * Gets a window from an element
 */
function getWindow( elem ) {
	return jQuery.isWindow( elem ) ? elem : elem.nodeType === 9 && elem.defaultView;
}

jQuery.offset = {
	setOffset: function( elem, options, i ) {
		var curPosition, curLeft, curCSSTop, curTop, curOffset, curCSSLeft, calculatePosition,
			position = jQuery.css( elem, "position" ),
			curElem = jQuery( elem ),
			props = {};

		// Set position first, in-case top/left are set even on static elem
		if ( position === "static" ) {
			elem.style.position = "relative";
		}

		curOffset = curElem.offset();
		curCSSTop = jQuery.css( elem, "top" );
		curCSSLeft = jQuery.css( elem, "left" );
		calculatePosition = ( position === "absolute" || position === "fixed" ) &&
			( curCSSTop + curCSSLeft ).indexOf("auto") > -1;

		// Need to be able to calculate position if either
		// top or left is auto and position is either absolute or fixed
		if ( calculatePosition ) {
			curPosition = curElem.position();
			curTop = curPosition.top;
			curLeft = curPosition.left;

		} else {
			curTop = parseFloat( curCSSTop ) || 0;
			curLeft = parseFloat( curCSSLeft ) || 0;
		}

		if ( jQuery.isFunction( options ) ) {
			options = options.call( elem, i, curOffset );
		}

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
		}

		if ( "using" in options ) {
			options.using.call( elem, props );

		} else {
			curElem.css( props );
		}
	}
};

jQuery.fn.extend({
	offset: function( options ) {
		if ( arguments.length ) {
			return options === undefined ?
				this :
				this.each(function( i ) {
					jQuery.offset.setOffset( this, options, i );
				});
		}

		var docElem, win,
			elem = this[ 0 ],
			box = { top: 0, left: 0 },
			doc = elem && elem.ownerDocument;

		if ( !doc ) {
			return;
		}

		docElem = doc.documentElement;

		// Make sure it's not a disconnected DOM node
		if ( !jQuery.contains( docElem, elem ) ) {
			return box;
		}

		// Support: BlackBerry 5, iOS 3 (original iPhone)
		// If we don't have gBCR, just use 0,0 rather than error
		if ( typeof elem.getBoundingClientRect !== strundefined ) {
			box = elem.getBoundingClientRect();
		}
		win = getWindow( doc );
		return {
			top: box.top + win.pageYOffset - docElem.clientTop,
			left: box.left + win.pageXOffset - docElem.clientLeft
		};
	},

	position: function() {
		if ( !this[ 0 ] ) {
			return;
		}

		var offsetParent, offset,
			elem = this[ 0 ],
			parentOffset = { top: 0, left: 0 };

		// Fixed elements are offset from window (parentOffset = {top:0, left: 0}, because it is its only offset parent
		if ( jQuery.css( elem, "position" ) === "fixed" ) {
			// Assume getBoundingClientRect is there when computed position is fixed
			offset = elem.getBoundingClientRect();

		} else {
			// Get *real* offsetParent
			offsetParent = this.offsetParent();

			// Get correct offsets
			offset = this.offset();
			if ( !jQuery.nodeName( offsetParent[ 0 ], "html" ) ) {
				parentOffset = offsetParent.offset();
			}

			// Add offsetParent borders
			parentOffset.top += jQuery.css( offsetParent[ 0 ], "borderTopWidth", true );
			parentOffset.left += jQuery.css( offsetParent[ 0 ], "borderLeftWidth", true );
		}

		// Subtract parent offsets and element margins
		return {
			top: offset.top - parentOffset.top - jQuery.css( elem, "marginTop", true ),
			left: offset.left - parentOffset.left - jQuery.css( elem, "marginLeft", true )
		};
	},

	offsetParent: function() {
		return this.map(function() {
			var offsetParent = this.offsetParent || docElem;

			while ( offsetParent && ( !jQuery.nodeName( offsetParent, "html" ) && jQuery.css( offsetParent, "position" ) === "static" ) ) {
				offsetParent = offsetParent.offsetParent;
			}

			return offsetParent || docElem;
		});
	}
});

// Create scrollLeft and scrollTop methods
jQuery.each( { scrollLeft: "pageXOffset", scrollTop: "pageYOffset" }, function( method, prop ) {
	var top = "pageYOffset" === prop;

	jQuery.fn[ method ] = function( val ) {
		return access( this, function( elem, method, val ) {
			var win = getWindow( elem );

			if ( val === undefined ) {
				return win ? win[ prop ] : elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : window.pageXOffset,
					top ? val : window.pageYOffset
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length, null );
	};
});

// Support: Safari<7+, Chrome<37+
// Add the top/left cssHooks using jQuery.fn.position
// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
// Blink bug: https://code.google.com/p/chromium/issues/detail?id=229280
// getComputedStyle returns percent when specified for top/left/bottom/right;
// rather than make the css module depend on the offset module, just check for it here
jQuery.each( [ "top", "left" ], function( i, prop ) {
	jQuery.cssHooks[ prop ] = addGetHookIf( support.pixelPosition,
		function( elem, computed ) {
			if ( computed ) {
				computed = curCSS( elem, prop );
				// If curCSS returns percentage, fallback to offset
				return rnumnonpx.test( computed ) ?
					jQuery( elem ).position()[ prop ] + "px" :
					computed;
			}
		}
	);
});


// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	jQuery.each( { padding: "inner" + name, content: type, "": "outer" + name }, function( defaultExtra, funcName ) {
		// Margin is only for outerHeight, outerWidth
		jQuery.fn[ funcName ] = function( margin, value ) {
			var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
				extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

			return access( this, function( elem, type, value ) {
				var doc;

				if ( jQuery.isWindow( elem ) ) {
					// As of 5/8/2012 this will yield incorrect results for Mobile Safari, but there
					// isn't a whole lot we can do. See pull request at this URL for discussion:
					// https://github.com/jquery/jquery/pull/764
					return elem.document.documentElement[ "client" + name ];
				}

				// Get document width or height
				if ( elem.nodeType === 9 ) {
					doc = elem.documentElement;

					// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height],
					// whichever is greatest
					return Math.max(
						elem.body[ "scroll" + name ], doc[ "scroll" + name ],
						elem.body[ "offset" + name ], doc[ "offset" + name ],
						doc[ "client" + name ]
					);
				}

				return value === undefined ?
					// Get width or height on the element, requesting but not forcing parseFloat
					jQuery.css( elem, type, extra ) :

					// Set width or height on the element
					jQuery.style( elem, type, value, extra );
			}, type, chainable ? margin : undefined, chainable, null );
		};
	});
});


// The number of elements contained in the matched element set
jQuery.fn.size = function() {
	return this.length;
};

jQuery.fn.andSelf = jQuery.fn.addBack;




// Register as a named AMD module, since jQuery can be concatenated with other
// files that may use define, but not via a proper concatenation script that
// understands anonymous AMD modules. A named AMD is safest and most robust
// way to register. Lowercase jquery is used because AMD module names are
// derived from file names, and jQuery is normally delivered in a lowercase
// file name. Do this after creating the global so that if an AMD module wants
// to call noConflict to hide this version of jQuery, it will work.

// Note that for maximum portability, libraries that are not jQuery should
// declare themselves as anonymous modules, and avoid setting a global if an
// AMD loader is present. jQuery is a special case. For more information, see
// https://github.com/jrburke/requirejs/wiki/Updating-existing-libraries#wiki-anon

if ( typeof define === "function" && define.amd ) {
	define( "jquery", [], function() {
		return jQuery;
	});
}




var
	// Map over jQuery in case of overwrite
	_jQuery = window.jQuery,

	// Map over the $ in case of overwrite
	_$ = window.$;

jQuery.noConflict = function( deep ) {
	if ( window.$ === jQuery ) {
		window.$ = _$;
	}

	if ( deep && window.jQuery === jQuery ) {
		window.jQuery = _jQuery;
	}

	return jQuery;
};

// Expose jQuery and $ identifiers, even in AMD
// (#7102#comment:10, https://github.com/jquery/jquery/pull/557)
// and CommonJS for browser emulators (#13566)
if ( typeof noGlobal === strundefined ) {
	window.jQuery = window.$ = jQuery;
}




return jQuery;

}));

jadeTemplate = {};
jadeTemplate['community'] = function template(locals) {
var buf = [];
var jade_mixins = {};
var jade_interp;

buf.push("<div class=\"community\"><div class=\"close\"><img data-src=\"close-btn\" class=\"shadow-icon\"/></div><a href=\"//github.com/pagodabox?utf8=%E2%9C%93&amp;query=nanobox\" target=\"_BLANK\" class=\"source\"><div class=\"icon\"><img data-src=\"git-big\" class=\"shadow-icon\"/></div><div class=\"txt\">Source Code</div></a><a href=\"//webchat.freenode.net/?channels=nanobox\" target=\"_BLANK\" class=\"irc\"><div class=\"icon\"><img data-src=\"irc-big\" class=\"shadow-icon\"/></div><div class=\"txt\">IRC : #nanobox <span>(freenode)</span></div></a><a href=\"//trello.com/b/4nVFzmNZ/nanobox\" target=\"_BLANK\" class=\"trello\"><div class=\"icon\"><img data-src=\"trello\" class=\"shadow-icon\"/></div><div class=\"txt\">Track Progress on Trello</div></a></div>");;return buf.join("");
};

jadeTemplate['download-list-link'] = function template(locals) {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (os, version, stability) {
buf.push("<li" + (jade.attr("os", "" + (os) + "", true, false)) + (jade.attr("release", "" + (version) + "", true, false)) + ">" + (jade.escape((jade_interp = version) == null ? '' : jade_interp)) + "\t<span>" + (jade.escape((jade_interp = stability) == null ? '' : jade_interp)) + "</span></li>");}.call(this,"os" in locals_for_with?locals_for_with.os:typeof os!=="undefined"?os:undefined,"version" in locals_for_with?locals_for_with.version:typeof version!=="undefined"?version:undefined,"stability" in locals_for_with?locals_for_with.stability:typeof stability!=="undefined"?stability:undefined));;return buf.join("");
};

jadeTemplate['top-nav'] = function template(locals) {
var buf = [];
var jade_mixins = {};
var jade_interp;

buf.push("<div class=\"header\"><div class=\"logo\"><a data=\"home\"><img data-src=\"logo-horizontal\" class=\"shadow-icon\"/></a></div></div><div class=\"nav\"><a data=\"downloads\">Download</a><a class=\"open-community\">Community</a><a data=\"engines\">Engines</a><a href=\"//dashboard.nanobox.io/users/sign_in\">Login / Register</a></div>");;return buf.join("");
};

jadeTemplate['pages/downloads'] = function template(locals) {
var buf = [];
var jade_mixins = {};
var jade_interp;

buf.push("<div class=\"downloads\"><div class=\"row downloader\"><div class=\"icon\"><img data-src=\"win\" class=\"shadow-icon\"/></div><div class=\"info\"><div class=\"title\">Mac OSX Intel - 1.4. GB</div><div class=\"option\"><div class=\"checkbox checked\"><img data-src=\"checkbox\" class=\"shadow-icon\"/></div><div class=\"copy\">Include &amp; Install Vagrant + Virtual Box * </div></div><div class=\"install\"> \nDownload Installer<img data-src=\"download-big\" class=\"shadow-icon\"/></div></div></div><div class=\"download-mini-btns\"><div data=\"mac\" class=\"btn\"><img data-src=\"mac\" scalable=\"true\" class=\"shadow-icon\"/></div><div data=\"lnx\" class=\"btn\"><img data-src=\"lnx\" scalable=\"true\" class=\"shadow-icon\"/></div><div data=\"win\" class=\"btn\"><img data-src=\"win\" scalable=\"true\" class=\"shadow-icon\"/></div></div><h3>What's in the installer</h3><div class=\"row break\"><div class=\"breakdown\"><img data-src=\"download-breakdown\" class=\"shadow-icon\"/></div><div class=\"descriptions\"><div class=\"description ubunto-image\"><h4>Boot-2-docker Ubunto Image <span>1.3 GB</span></h4><p>Nanobox installs your app and runtimes (ruby, node, mysql, etc) on a virtual machine running this slim version is Linux. </p></div><div class=\"description nanobox\"><h4>Nanobox <span>8 MB</span></h4><p>Orchestration layer that configures and runs your app</p></div><div class=\"description vagrant\"><h4>Vagrant <span>81 MB</span></h4><p>Creates / manages the Virtual Machine</p></div><div class=\"description virtual-box\"><h4>Virtual Box <span>1.3 GB</span></h4><p>Does the actual virtualization</p></div></div></div><h3>&nbsp;</h3><div class=\"row asterix\">* Uncheck this box if you already have Vagrant & Virtual box installed, or if you would like to download and install them yourself</div></div>");;return buf.join("");
};

jadeTemplate['pages/engines'] = function template(locals) {
var buf = [];
var jade_mixins = {};
var jade_interp;

buf.push("<div class=\"languages-and-frameworks\"><div class=\"section-header\"><div class=\"science-and-search\"><img data-src=\"mad-scientist\" scalable=\"true\" class=\"shadow-icon\"/><div class=\"search\"><input placeholder=\"Search Existing Engines\"/><div class=\"search-btn\"><img data-src=\"search\" class=\"shadow-icon\"/></div></div></div><div class=\"title\"><div class=\"text\">IT’S YOUR FRAMEWORK, YOU DEFINE THE IDEAL RUNTIME</div><a href=\"//webchat.freenode.net/?channels=nanobox\" class=\"irc-blurb\"><img data-src=\"irc-outline\" class=\"shadow-icon\"/><div class=\"txt\">Join our IRC channel, for <br/> help - #nanobox on freenode</div></a></div></div><div class=\"row plugin-overview\"><div class=\"descript\"><h2>Writing a Custom Engine</h2><p>Five BASH scripts specify the services your framework needs and how they should be configured so devs can begin building their app immediately with no need to install or configure anything.</p></div><div class=\"graphic\"><img data-src=\"plugin-scripts\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"scripts\"><div class=\"script\"><h3 class=\"required\">sniff</h3><div class=\"row\"><p class=\"descript\">This script crawls the user’s code looking for patterns unique to your framework. If a positive match is found, this script should returns true. </p><div class=\"script\"><pre><code class=\"language-javascript\">#!/bin/sh\nif ( match_file( \"/mage.php\" )) {\n  print true;\n} else {\n  print false;\n}</code></pre></div></div></div><div class=\"script\"><h3>boxfile</h3><div class=\"row\"><p class=\"descript\">Set any boxfile settings your framework needs such as instantiating webs, databases, and caching services. </p><div class=\"script\"><pre><code class=\"language-javascript\">#!/bin/sh\nif ( match_file( \"/mage.php\" )) {\n  print true;\n} else {\n  print false;\n}</code></pre></div></div></div><div class=\"script\"><h3>prepare</h3><div class=\"row\"><p class=\"descript\">Set any boxfile settings your framework needs such as instantiating webs, databases, and caching services. </p><div class=\"script\"><pre><code class=\"language-javascript\">#!/bin/sh\nif ( match_file( \"/mage.php\" )) {\n  print true;\n} else {\n  print false;\n}</code></pre></div></div></div><div class=\"script\"><h3 class=\"required\">build</h3><div class=\"row\"><p class=\"descript\">Set any boxfile settings your framework needs such as instantiating webs, databases, and caching services. </p><div class=\"script\"><pre><code class=\"language-javascript\">#!/bin/sh\nif ( match_file( \"/mage.php\" )) {\n  print true;\n} else {\n  print false;\n}</code></pre></div></div></div><div class=\"script\"><h3>cleanup</h3><div class=\"row\"><p class=\"descript\">Set any boxfile settings your framework needs such as instantiating webs, databases, and caching services. </p><div class=\"script\"><pre><code class=\"language-javascript\">#!/bin/sh\nif ( match_file( \"/mage.php\" )) {\n  print true;\n} else {\n  print false;\n}</code></pre></div></div></div></div></div>");;return buf.join("");
};

jadeTemplate['pages/home'] = function template(locals) {
var buf = [];
var jade_mixins = {};
var jade_interp;

buf.push("<div class=\"home\"><div class=\"main-summary\"><img data-src=\"top-mini-stack\" class=\"shadow-icon\"/><div class=\"info\"><h1>Vagrant + Docker + Engines</h1><h4>Local App Environments -  Automated / Lightweight / Reusable </h4><div class=\"links\"> <a href=\"https://github.com/pagodabox?utf8=%E2%9C%93&amp;query=nanobox\" class=\"github\"><img data-src=\"git\" class=\"shadow-icon\"/><p>Fork me on github</p></a><a href=\"/downloads.html\" class=\"download\"><img data-src=\"download-home\" class=\"shadow-icon\"/><p>Download</p></a><a href=\"//webchat.freenode.net/?channels=nanobox\" target=\"_BLANK\" class=\"irc\"><img data-src=\"irc\" class=\"shadow-icon\"/><p>IRC - #nanobox <span>(freenode)</span></p></a></div></div></div><div class=\"overview\"><div class=\"info\"><div class=\"blurb src-code\"><h2><span>1 </span>App Source Code</h2><p>Focus on coding rather than configuring a local dev environment </p></div><div class=\"blurb engine\"><h2><span>2 </span>Language Engine</h2><p>The Engine detects your app type and specifies what services your app needs (ruby, mongo, etc) and how they should be configured.</p></div><div class=\"blurb docker\"><h2><span>3 </span>Docker Containers </h2><p>Containers are configured and initialized. Your code is then built and installed. </p></div><div class=\"blurb vagrant\"><h2><span>4 </span>Vagrant / Virtual Box</h2><p>Your services run in an ultra lightweight Ubuntu virtual \u0003machine (30mb RAM).  \u0003Requests to localhost are \u0003proxied to your app</p></div></div><div class=\"graphic\"><img data-src=\"sandwich\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"mini-overview\"><div class=\"mini\"><h2>Develop your App</h2><p>Run your code and itterate your app in a fast lightweight VM </p><div class=\"script\"><pre><code class=\"language-nanobox\">$ nanobox up\nDetecting app type\nLaunching Vagrant Virtual Machine\nInstalling runtimes in VM\netc..</code></pre></div><a href=\"#developing-your-app\">How it works</a></div><div class=\"mini\"><h2>Run Commands</h2><p>Run generators, tests and other runtime specific scripts. </p><div class=\"script\"><pre><code class=\"language-nanobox\">$ nanobox enter\n  Entering virtual machine context:\n> rake test # Run test suite</code></pre></div><a href=\"#developing-your-app\">How it works</a></div></div><h1 id=\"developing-your-app\">How it works <span class=\"sub\"> - Developing your App</span></h1><div class=\"top-blurb\"><span class=\"prompt\">$ </span><span class=\"command\">nanobox</span><span class=\"param\"> up</span> : creates a virtual staging environment and installs everything your code needs to run. As you edit your code, your files are compiled on and copied into your running container. The following is a breakdown of what nanobox is doing behind the scenes:</div><div class=\"row\"><div class=\"descript\"><h2><span>1</span>Vagrant initializes</h2><p>Nanobox uses Vagrant to launch a virtual machine running a custom operating system with all the necessary Docker and Nanobox bits installed and running at boot. The Vagrantfile is configured to mount the code directory inside the virtual machine as a shared directory.</p></div><div class=\"visual vagrant-init\"><img data-src=\"vagrant-initializes\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"row\"><div class=\"descript\"><h2><span>2</span>Nanobox daemon initializes</h2><p>After the virtual machine boots, a Nanobox api daemon is spawned and waits to receive commands from the nanobox client.</p></div><div class=\"visual nanobox-daemon\"><img data-src=\"nanobox-initializes\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"row\"><div class=\"descript\"><h2><span>3</span>A build container is launched and your Code is copied into the container</h2><p>The client tells the api daemon to start a deploy process which launches a Docker container used to build, prepare, and package your code. Once the container is up and running, the code from your workstation is rsync’d into the container. Copying the code prevents the build process from modifying your codebase directly.</p></div><div class=\"visual vagrant-init\"><img data-src=\"build-cont-launches\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"row\"><div class=\"descript\"><h2><span>4</span>Each Engine sniffs the code looking for a positive match to determine which language / framework your app is written in</h2><p>A registry of Engines sniff your code to determine if you are using a known framework. The build process is custom-tailored to optimally configure the environment for that framework. eg: install and configure runtimes and services such as ruby, node.js, PostgreSQL, MySQL, etc..</p></div><div class=\"visual engine-sniff\"><img data-src=\"framework-sniff\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"row\"><div class=\"descript\"><h2><span>5</span>The matched Engine generates a Boxfile defining the services your app needs to run and how each should be configured</h2><p>The Engine determines which services your app depends on. It can analyze the codebase to determine dependencies, or it might already know what is needed. As service dependencies are determined, a Boxfile is generated that informs Nanobox which services to launch and how to configure them. These services might include redis, postgres, memcache, mysql, or other data-specific services.</p></div><div class=\"visual boxfile\"><img data-src=\"boxfile\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"row\"><div class=\"descript\"><h2><span>6</span>Nanobox launches and configures Docker containers specified in the Boxfile</h2><p>The Boxfile in the codebase and the Boxfile from the Engine are merged. Nanobox launches and configures a Docker container for each service specified in the merged Boxfile. Nanobox overlays a private network with custom IP addresses on a native tcp stack through which the containers can communicate.</p></div><div class=\"visual launch-containers\"><img data-src=\"docker-containers\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"row\"><div class=\"descript\"><h2><span>7</span>Code is built and installed into code containers and the build container is decommissioned</h2><p>In the build container, your code is compiled and prepared to run. The Engine generates or modifies config files that allow your app to communicate with the provisioned services. In some cases, the Engine will modify source code, if necessary, to adjust service connection details or ensure a legacy app is suited for a distributed architecture. With the build complete, the output is dropped into another container which runs your app.</p></div><div class=\"visual build-code\"><img data-src=\"code-built\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"row\"><div class=\"descript\"><h2><span>8</span>A router is launched to proxy localhost requests to your app</h2><p>A router is launched to proxy requests from your workstation into the container hosting your finalized app. For simplicity, a DNS entry is added to your workstation. Your app is launched and ready for development iteration.</p></div><div class=\"visual router\"><img data-src=\"proxy-router\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"row\"><div class=\"descript\"><h2><span>9</span>If files are watched, local saves will run steps 3-8 automatically</h2><p>With your development environment up and running, you can refresh the build at any time. If you started your Nanobox with --watch, any file changes within your code will automatically trigger a rebuild. After the initial build, assets are cached between deploys making subsequent builds really quick.</p></div><div class=\"visual watch\"><img data-src=\"watched-files\" scalable=\"true\" class=\"shadow-icon\"/></div></div><h1>Push to Production <span class=\"optional\">(optional)</span></h1><div class=\"row first\"><div class=\"descript\"><h2>Push to Pagoda Box or any other service that supports the nanobox protocol </h2><p>With your development environment up and running, you can refresh the build at any time. If you started your Nanobox with --watch, any file changes within your code will automatically trigger a rebuild. After the initial build, assets are cached between deploys making subsequent builds really quick.</p></div><div class=\"visual\"><img data-src=\"push-pagoda\" scalable=\"true\" class=\"shadow-icon\"/></div></div><h1>Create an engine for your framework</h1><div class=\"row first engine-blurb\"><div class=\"visual\"><img data-src=\"mad-scientist-window\" scalable=\"true\" class=\"shadow-icon\"/></div><div class=\"descript\"><h2>It’s your framework, you define the ideal runtime</h2><p>You specify the services your framework needs and how they should be configured so devs can begin building their app immediately with no need to install or configure anything.</p><a href=\"/index.html?page=engines\" class=\"inline\">Get started<img data-src=\"right-arrow\" class=\"shadow-icon\"/></a></div></div><h1 id=\"running-commands\" class=\"running-commands\">How it works <span class=\"sub\"> - Running Commands</span></h1><div class=\"top-blurb running-commands\"><span class=\"prompt\">$ </span><span class=\"command\">nanobox</span><span class=\"param\"> up</span> : creates a virtual staging environment and installs everything your code needs to run. As you edit your code, your files are compiled and copied into your running container. The following is a breakdown of what nanobox is doing behind the scenes:</div><div class=\"row running-commands\"><div class=\"descript\"><h2><span>1</span>Vagrant initializes</h2><p>Nanobox uses Vagrant to launch a virtual machine running a custom operating system with all the necessary Docker and Nanobox bits installed and running at boot. The Vagrantfile is configured to mount the code directory inside the virtual machine as a shared directory.</p></div><div class=\"visual vagrant-init\"><img data-src=\"vagrant-initializes\" scalable=\"true\" class=\"shadow-icon\"/></div></div></div>");;return buf.join("");
};

jadeTemplate['pages/legal'] = function template(locals) {
var buf = [];
var jade_mixins = {};
var jade_interp;

buf.push("<pre class=\"legal\">PLEASE READ CAREFULLY: THIS MASTER SERVICES AGREEMENT is between Pagoda Box, Inc. (“Pagoda Box”) and the individual or entity (“Customer,” “you,” “yours,” etc.) for certain computer infrastructure and related services, including the Nanobox website, the Nanobox Development Tool, the Nanobox Application Programming Interface (“API”), the Customer Dashboard (as defined herein), and any other software or services offered by Pagoda Box in connection with any of those (the “Nanobox Services” or the “Services”). The Customer’s use of and access to the Services is governed by the Master Services Agreement which includes the Terms of Service, Service Level Agreement, Privacy Agreement, IP Address Policy, Nanobox Acceptable Use Policy and relevant appendices (which may include without limitation the international-related addendum, if any, that applies) (collectively, the “MSA”).   \n \nBY INSTALLING OR USING THE SERVICES, THE CUSTOMER AGREES: \n \n(1) THAT THE CUSTOMER HAS ACCEPTED THE MSA IN ITS ENTIRETY; \n(2) TO BE BOUND BY THE MSA AS AMENDED FROM TIME TO TIME AS PROVIDED IN THESE TERMS OF SERVICE ;  AND\n(3) THAT THIS MSA CONSTITUTES A BINDING AND ENFORCEABLE OBLIGATION BETWEEN PAGODA BOX AND CUSTOMER.  IF THE CUSTOMER IS AN INDIVIDUAL, THE INDIVIDUAL REPRESENTS AND WARRANTS THAT (S)HE HAS THE LEGAL RIGHT TO ENTER INTO THE MSA. IF THE CUSTOMER IS AN ENTITY, THE INDIVIDUAL AGREEING ON BEHALF OF THE ENTITY REPRESENTS AND WARRANTS THAT (S)HE HAS THE AUTHORITY TO BIND THE ENTITY AND AGREES TO BE JOINTLY AND SEVERALLY LIABLE WITH THE ENTITY FOR EACH AND EVERY BREACH HEREOF.\n \nIF YOU OR THE ENTITY YOU REPRESENT DO NOT AGREE WITH ALL THE TERMS OF THIS MSA OR DO NOT AGREE TO BE BOUND BY THIS MSA, YOU MAY NOT INSTALL OR USE THE SERVICES. \n \nTerms of Service (“TOS”) \n \n1. DEFINITIONS. \n \n“Account Information” means billing information, contact information, payment information and such other information defined as “Account Information” in the Customer Dashboard. \n \n“Affiliate” means any legal entity that a party controls, that controls a party, or that is under common control with a party. For purposes of this definition, “control” shall mean beneficial ownership of the securities entitled to vote in the election of directors (or, in the case of an entity that is not a corporation, of the election of the corresponding management authority) in the entity of (i) more than fifty percent (50%) of the securities or (ii) such lesser percentage of securities as is the maximum ownership permitted in the country where the entity exists. \n \n“Anniversary Billing Date” means the date of the month of the Effective Date except as provided in this definition. For example, if the Effective Date is June 6, 2014, then the Anniversary Billing Date is the sixth of the calendar month. If the Anniversary Billing Date is a date in a calendar month which does not exist in each calendar month, then the Anniversary Billing Date shall be the 28th of each month (i.e. if the Anniversary Billing Date is the 30th, then the Anniversary Billing Date shall be the 28th of each month). \n \n“AUP” means the Acceptable Use Policy which is located at www.nanobox.io/legal (or such other location as Pagoda Box may designate from time to time). \n \n“Customer” means the individual or entity who agrees to the terms of the MSA by clicking or checking the box presented with the MSA, installing and/or using the Services. \n \n“Customer Content” means all data, software and information, including, without limitation, data text, software, scripts, video, sound, music, graphics and images that are created, uploaded or transferred in connection with the Services by Customer or its Affiliates. \n \n“Customer End User” means a Third Party which is an end user of a Customer Offering. \n \n“Customer Offering” means services created by Customer based in whole or in part on the Services which are used by Third Parties. \n \n“Customer Dashboard” means the portal at dashboard.nanobox.io (or such other location as Pagoda Box may designate from time to time) or the same information as available through the Nanobox Application Programming Interface. \n \n“Development Tool” means a the downloaded command line application, bundled virtual machine and its contents.\n \n“Effective Date” means the date on which the Customer accepts the MSA by clicking or checking the box presented with the MSA, installing and/or using the Services. \n \n“Feedback” means any and all suggestion, comments, improvements, or other feedback about the Services that Customer or any Affiliate provides to Pagoda Box either directly or indirectly via a Pagoda Box-controlled web site. \n \n“Flow-Through Provisions” mean the terms of agreements for services provided by Third Parties which are included in the MSA as required by providers of Third Party Services. The Flow-Through Provisions apply only to the relevant services provided by Third Parties. Such services provided by Third Parties are part of the Services and are subject to the terms of the MSA as well as the Flow-Through Provisions. \n \n“Hourly Services” means the Services that Pagoda Box offers on an hourly basis. \n \n“MSA” has the meaning set forth in the recitals. \n \n“Order” means an order for a Service which may include a new order for a Service or an upgrade or a downgrade of a Service. The Order must be placed through the Customer Dashboard or such other method designated by Pagoda Box from time to time. Orders do not apply to Third Party Services. \n \n“PII” means information that can be used to identify, contact, or locate a single person or that can be used with other sources to uniquely identify a single individual. \n \n“Privacy Agreement” means the terms governing the use of PII which is located at www.nanobox.io/legal (or such other location as Pagoda Box may designate from time to time). \n \n“Private Network” means the term as described in the AUP\n \n“Public Network” means the term as described in the AUP.\n \n“Services” has the meaning set forth in the recitals.\n \n“Service Level Agreement” means the Service Level Agreement which is located at www.nanobox.io/legal (or such other location as Pagoda Box may designate from time to time).\n \n“Site” means www.nanobox.io (or such other location as Pagoda Box may designate from time to time).\n \n“SLA Credits” mean the credits awarded by Pagoda Box, generally awarded at our discretion for service downtime as described in the Service Level Agreement.\n \n“Pagoda Box” has the meaning set forth in the recitals.\n \n“Term” means the term as set forth in Section 16.\n \n“Third Party” means an individual or an entity which is not a Customer, Pagoda Box, an Affiliate of Pagoda Box or an Affiliate of Customer.\n \n“Third Party Services” mean services which are provided by Third Parties directly to Customer. The definition of Services does not include Third Party Services.\n \n“TOS” means the terms of service for the Services.\n \n“TPS Agreements” mean agreements for Third Party Services which are directly between the Customer and the provider of the Third Party Services. These agreements are separate and independent from the MSA and Pagoda Box is not a party to these agreements.\n \n2. PAGODA BOX’S OBLIGATIONS.\n2.1 Provision of Services. Contingent on Pagoda Box’s acceptance of an Order (which acceptance can be revoked at any time in Pagoda Box’s sole discretion as set forth herein) and subject to the terms of the MSA, Pagoda Box agrees to use reasonable commercial efforts to provide the Services subject to the terms of this MSA, Privacy Agreement and other relevant documents available at www.nanobox.io/legal (or such other location as Pagoda Box may designate from time to time).  Pagoda Box retains the right to reject the request for Services by any individual or entity in its sole discretion. Pagoda Box may change, discontinue, add, modify, re-price or remove features or functionality from the Services or make changes to any legal policy or document upon notice to Customer provided through the Customer Dashboard. It is the Customer’s responsibility to review the Customer Dashboard for such notices on a frequent basis. If Customer continues to use the Services following any such modification, such use will be deemed acceptance of such modification by Customer. The Third Party Services are provided by the relevant Third Parties and Pagoda Box is not responsible for the provision of Third Party Services.\n \n2.2 Age. Customer must be at least 18 years of age or otherwise have the legal capacity to order Services. If Customer is ordering Services on behalf of an employer, company, or other legal entity, Customer represents and warrants that it has the legal right and authority to order Services and be bound to this MSA.  Customer will be personally liable for any breach by a legal entity on whose behalf Customer enters into the MSA.\n \n3. PRIVACY.\n3.1 Collection of PII. The collection and use of PII is governed by the Privacy Agreement.\n \n4. USE OF AND ACCESS TO THE SERVICES.\n4.1 Ordering and Modification of Services. Customer may order Services and all upgrades to such Services through the Customer Dashboard or as otherwise designated by Pagoda Box. Pagoda Box may accept such Orders in its discretion and shall give notice to Customer of acceptance of such Order through the Customer Dashboard. For downgrades or cancellation of Services, Customer may also cancel Services or perform all downgrades to such Services through the Customer Dashboard or as otherwise designated by Pagoda Box. \n \n4.2 Rights to Use Services. Subject to the terms and conditions of this MSA (including the Term), Pagoda Box grants Customer a non-exclusive, nontransferable, non-sublicenseable (except to the extent required to exercise rights under Section 4.2(b)), revocable right in the Services solely to: (a) use and access the Services for internal purposes; and (b) use the Services to create, offer and provide the Customer Offerings.\n \n4.3 Customer Obligations: Customer agrees to do each of the following: (i) comply with all applicable laws, rules and regulations, including, without limitation, the Foreign Corrupt Practices Act and related international anti-corruption laws and the Digital Millennium Copyright Act and related copyright laws; (ii) pay the fees for the Services when due; (iii) use reasonable security precautions for providing access to the Services by its employees or other individuals to whom it provides access; (iv) cooperate with Pagoda Box’s investigation of security problems, and any suspected breach of the MSA; (v) comply with all license terms or terms of use for any software, content, service or website (including Customer Content) which Customer uses or accesses when using the Services; (vi) give Pagoda Box true, accurate, current, and complete Account Information; (vii) keep Customer’s Account Information up to date; (viii) be responsible for the use of the Services by Customer and Customer End Users and any other person to whom Customer has given access to the Customer Offering; (ix) comply with the TPS Agreements; (ix) use commercially reasonable efforts to prevent unauthorized access to or use of the Services and immediately notify Pagoda Box of any known or suspected unauthorized use of Customer’s account, the Services or any other breach of security; and (xi) where the Customer provides Customer Offering as permitted under this Agreement, Customer must enter into an agreement with Customer’s End User which shall include the relevant terms of this Agreement and release Pagoda Box from any and all liability for damages or losses Customer’s End Users may incur as a result of using the Customer Offering. Customer may not use the Services in any situation where failure or fault of the Services could lead to death or serious bodily injury of any person, or to physical or environmental damage. For example, Customer may not use, or permit any other person to use, the Services in connection with aircraft or other modes of human mass transportation, nuclear or chemical facilities, or Class III medical devices under the Federal Food, Drug and Cosmetic Act. Customer may not resell any of the Services alone to any Third Party without first entering into a reseller agreement with Pagoda Box.\n \n4.4 Special Terms for Third Party Services. To the extent Customer orders Third Party Services under TPS Agreements, Pagoda Box is not responsible for such Third Party Services and the provider of the Third Party Service is solely responsible for providing such Third Party Services. However, the Customer also agrees that the following terms of the TOS apply to such Third Party Services: Sections 8, 9, 10, 11, 15 and 16.\n \n5. PAYMENT.\n5.1 Fees: Payment for all fees for the provision of Services such as servers, virtual servers, shared storage and backups shall be due on the next Anniversary Billing Date. One time fees, such as setup fees, bandwidth, storage, administrative fees and late fees, are due and payable when invoiced, and/or as agreed by Pagoda Box through the Customer Dashboard.\n \n5.2 Payment Methods: The payment shall be made by the credit card (or other acceptable method of payment, in Pagoda Box’s sole discretion) (the “MOP”) maintained on file with Pagoda Box.  Customer is responsible to update the MOP periodically and failure to do so may result in the termination of this Agreement and the termination of any Applications owned by Customer in Pagoda Box’s sole discretion. Pagoda Box is authorized to charge the MOP on file automatically each month on the Anniversary Billing Date for all fees incurred by Customer since the prior Anniversary Billing Date and such authorization may be revoked only prospectively as to fees not yet incurred by Customer.\n \n5.3 Taxes: All prices and fees specified in or referred to in this MSA are stated exclusive of any tax, including withholding tax, sales, use, value added, levies, import and custom duties, excise or other similar or equivalent taxes imposed on the supply of Services. Any sales, use, levies, excise, withholding taxes or similar charges, direct or indirect, applicable or to become applicable, which are levied as a result of the supply of the Services shall be paid by the Customer. Neither party shall be liable for the other party’s taxes based on income. If withholding tax applies to any payments for Services made under this MSA, the Customer may deduct such taxes and shall pay such taxes to the appropriate tax authority; provided that Customer shall provide Pagoda Box with an official receipt for any such taxes withheld and must notify Pagoda Box prior to payment that withholding tax is required to be paid and Customer shall pay to Pagoda Box any additional amount to ensure that Pagoda Box receives the full amount of the invoice. If Pagoda Box has the legal obligation to pay or collect taxes for which Customer is responsible under this paragraph, the appropriate amount shall be charged to and paid by Customer in addition to the amount of the invoice, unless Customer provides Pagoda Box with a valid tax exemption certificate authorized by the appropriate taxing authority. The parties undertake to cooperate, where possible, to minimize the amount of withholding tax due by making advance clearance applications under the relevant double taxation treaties (where applicable) to the relevant tax authority to reduce the rate of withholding tax or exempt entirely this amount if applicable. In any event, the Customer undertakes to account for any tax withheld to the tax authorities on a timely basis.\n \n5.4 SLA Credits: SLA Credits, if issued to Customer’s account, shall be used only to offset future charges for certain Services as provided in the Service Level Agreement. SLA Credits may not be sold, converted to cash or transferred to Third Parties or Affiliates. SLA Credits shall expire on the termination or expiration of the MSA.\n \n5.5 Additional Fees. The Customer’s failure to pay any fees on the due date shall result in incurring a late fee of $5 per Application. If Pagoda Box has suspended the Customer’s access to the Services over the Public Network as provided in Section 15, the Customer shall incur a $5 per Application reconnection fee. Such fees shall be due upon receipt, and Pagoda Box will not reconnect any Services to the Customer until full payment of such fees plus any and all amounts then due for the Services.\n \n5.6 Refunds & Disputes: All fees paid for Services to Pagoda Box are non-refundable. If the Customer believes that the bills are in error, the Customer’s sole and exclusive remedy is to seek SLA credits by sending an email to billing@nanobox.com within 30 days of the receipt of the disputed bill, which will open a billing ticket to give notice to Pagoda Box. Any invoice not disputed by Customer in accordance with this section within 30 days of receipt of the invoice shall be deemed conclusively accepted by Customer as correct. Customer shall not chargeback any credit card payments to Pagoda Box and any such chargeback will result in an additional payment to Pagoda Box of up to $500 which is a reasonable estimate of Pagoda Box’s additional administrative costs to contest any such chargeback. Customer is responsible for any fees and costs (including, but not limited to, reasonable attorneys’ fees, court costs and collection agency fees) incurred by Pagoda Box in enforcing collection of fees.\n \n6. OWNERSHIP OF SITE: Customer hereby acknowledges and agrees that Pagoda Box (or its licensors) own all legal right, title and interest in and to the Site and the Services provided by Pagoda Box, including, without limitation, any intellectual property or other proprietary rights which subsist in the Site and Services (whether such rights are registered or unregistered, and wherever in the world those rights may exist). As between Customer and Pagoda Box, all materials on the Site, including, but not limited to, graphics, user and visual interfaces, images, software, applications, and text, as well as the design, structure, selection, coordination, expression, “look and feel”, and arrangement of the Site and its content (except for any Customer Content), and the domain names, trademarks, service marks, proprietary logos and other distinctive brand features found on the Site, are all owned by Pagoda Box or its licensors.\n \n7. SECURITY: Pagoda Box agrees to maintain reasonable and appropriate measures related to physical security to protect Customer Content. Other than responsibility for physical security, Customer shall be solely responsible for data maintenance, integrity, retention, security, and backup of the Customer Content. Pagoda Box will take commercially reasonable steps to maintain the confidentiality of the Customer Content in performing data backup services, which backup services are not redundant, and not geographically distributed. If Customer transfers or is otherwise involved in the transfer of any Customer Content (whether in connection with its business or otherwise) over the Public Network or Private Networks, then Customer is solely responsible for compliance with any applicable laws, rules and regulations in any and all applicable regions or countries regarding the security, privacy, legality and/or safe handling of such Customer Content.\n \n8. INDEMNIFICATION BY CUSTOMER: Customer hereby agrees to indemnify, defend and hold harmless Pagoda Box and its parents, Affiliates, licensors and providers of Third Party Services, and their respective directors, officers, employees, contractors, agents, successors, and assigns, (collectively, the “Pagoda Box Parties”) (Pagoda Box and each of the Pagoda Box Parties, an “Indemnified Party”), from and against any and all liability (including, without limitation, attorneys’ fees and costs) incurred by the Indemnified Parties in connection with any actual or alleged suit, claim, damages, harm, or other responsibility whatsoever  (“Claim”) arising out of: (a) Customer’s use of the Services or Third Party Services; (b) any breach or alleged breach by Customer of this MSA; (c) any breach or alleged breach by Customer or Customer End Users of a Third Party’s rights, including, without limitation, any actual or alleged infringement or misappropriation of a Third Party’s copyright, trade secret, patent, trademark, privacy, publication or other proprietary right; (d) any damage caused by or alleged to have been caused by Customer or Customer End Users to the Site or Services; or (e) any actual or alleged violation or non-compliance by Customer or Customer End Users with any applicable law, court order, rule or regulation in any jurisdiction. The counsel which Customer selects for the defense or settlement of a Claim must be approved in writing in advance by Pagoda Box prior to such counsel being engaged to represent the Indemnified Parties. Customer shall not in any event consent to any judgment, settlement, attachment, or lien, or any other act adverse to the interests of Pagoda Box or any Pagoda Box Party without the prior written consent of Pagoda Box and/or the applicable Pagoda Box Party(s). Customer and Customer’s counsel will cooperate as fully as reasonably required, and provide such information as reasonably requested, by the Pagoda Box or the Pagoda Box Parties in the defense or settlement of any such matter.\n \n9. DISCLAIMER OF WARRANTIES: EXCEPT AS REQUIRED BY LAW CUSTOMER’S USE OF THE SITE AND SERVICES IS ENTIRELY AT CUSTOMER’S OWN DISCRETION AND RISK. THE SITE AND SERVICES ARE FURNISHED BY PAGODA BOX “AS IS” AND WITHOUT WARRANTIES OR CONDITIONS, STATUTORY OR OTHERWISE, OF ANY KIND. PAGODA BOX; (A) EXPRESSLY DISCLAIMS ALL WARRANTIES, WHETHER EXPRESS, IMPLIED OR STATUTORY, INCLUDING, WITHOUT LIMITATION, THE IMPLIED WARRANTIES OF NON-INFRINGEMENT, TITLE, MERCHANTABILITY, AND FITNESS FOR A PARTICULAR PURPOSE; (B) DOES NOT WARRANT THAT THE SERVICES WILL MEET CUSTOMER’S REQUIREMENTS, OR THAT THEIR OPERATION WILL BE TIMELY, UNINTERRUPTED, SECURE, OR ERROR-FREE OR THAT ANY DEFECTS WILL BE CORRECTED; AND (C) DOES NOT WARRANT OR MAKE ANY REPRESENTATIONS OR CONDITIONS REGARDING THE USE OR THE RESULTS OF THE USE OF THE SERVICES IN TERMS OF ITS ACCURACY, RELIABILITY, TIMELINESS, COMPLETENESS, OR OTHERWISE. CUSTOMER ASSUMES TOTAL RESPONSIBILITY FOR ITS AND CUSTOMER END USERS’ USE OF THE SERVICES.\n \n10. DISCLAIMER OF CONSEQUENTIAL DAMAGES. IN NO EVENT WILL PAGODA BOX BE LIABLE TO CUSTOMER, FOR ANY SPECIAL, INDIRECT, INCIDENTAL, PUNITIVE, EXEMPLARY, RELIANCE, OR CONSEQUENTIAL DAMAGES OF ANY KIND, INCLUDING, BUT NOT LIMITED TO, COMPENSATION, REIMBURSEMENT OR DAMAGES IN CONNECTION WITH, ARISING OUT OF, OR RELATING TO, THE USE, OR LOSS OF USE OF, THE SERVICES, LOSS OF PROFITS, LOSS OF GOODWILL, LOSS OF DATA OR CONTENT, COST OF PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES, SUBSEQUENT OR OTHER COMMERCIAL LOSS, OR FOR ANY OTHER REASON OF ANY KIND, WHETHER BASED ON CONTRACT OR TORT (INCLUDING, WITHOUT LIMITATION, NEGLIGENCE OR STRICT LIABILITY), EVEN IF PAGODA BOX HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.\n \n11. LIMITATION OF LIABILITY.  PAGODA BOX WILL NOT BE LIABLE TO CUSTOMER FOR DAMAGES FOR BREACH OF ANY EXPRESS OR IMPLIED WARRANTY OR CONDITION, BREACH OF CONTRACT, NEGLIGENCE, STRICT LIABILITY OR ANY OTHER LEGAL THEORY RELATED TO THE SITE OR SERVICES. IF, NOTWITHSTANDING THE FOREGOING, PAGODA BOX IS FOUND TO BE LIABLE TO CUSTOMER FOR ANY DAMAGE OR LOSS WHICH ARISES UNDER OR IN CONNECTION WITH THE SERVICES, PAGODA BOX’S TOTAL CUMULATIVE LIABILITY TO CUSTOMER SHALL IN NO EVENT EXCEED THE AMOUNT OF FEES ACTUALLY PAID BY THE CUSTOMER FOR THE SERVICES FOR THE THREE MONTHS PRIOR TO THE OCCURRENCE OF THE EVENT(S) GIVING RISE TO PAGODA BOX’S LIABILITY.\n \n12. ALLOCATION OF LIABILITY. THE PARTIES ACKNOWLEDGE THAT THE DISCLAIMER OF WARRANTIES, DISCLAIMER OF CONSEQUENTIAL DAMAGES AND LIMITATIONS OF LIABILITY IN THE MSA AND IN THE OTHER PROVISIONS OF THIS MSA AND THE ALLOCATION OF RISK HEREIN ARE AN ESSENTIAL ELEMENT OF THE BARGAIN BETWEEN THE PARTIES, WITHOUT WHICH PAGODA BOX WOULD NOT HAVE ENTERED INTO THIS MSA. PAGODA BOX’S PRICING REFLECTS THIS ALLOCATION OF RISK AND THESE LIMITATIONS.\n \n13. TRADEMARKS. Customer hereby grants to Pagoda Box a non-exclusive, worldwide, royalty-free, fully paid-up license during the Term to use Customer’s trademarks, marks, logos or trade names in connection with Pagoda Box’s provision of Services (including support of Services) to Customer and to be listed as a customer of the Services by Pagoda Box or its designees. The license granted in this Section 14 will include the right of Pagoda Box to sublicense its Affiliates and any Third Parties providing all or part of the Services on behalf of Pagoda Box to achieve the foregoing.\n \n14. SUSPENSION.\n14.1 Suspension. Pagoda Box may suspend provision of Services to Customer without liability if: (i) Pagoda Box reasonably believes that the Services are being used (or have been or will be used) by Customer in violation of the MSA or any applicable law, court order, rule or regulation in any jurisdiction; (ii) Customer does not cooperate with Pagoda Box’s investigation of any suspected violation of the MSA or any applicable law, court order, rule or regulation in any jurisdiction; (iii) Pagoda Box reasonably believes that Services provided to Customer have been accessed or manipulated by a Third Party without Customer’s consent or in violation of the MSA; (iv) Pagoda Box reasonably believes that suspension of the Services is necessary to protect Pagoda Box’s network or other Pagoda Box customers; (v) a payment for the Services is overdue by more than 10 days including the Anniversary Billing Date (and in addition, Pagoda Box may, in Pagoda Box’s sole discretion, continue to make the Services available through the Public Network and may suspend such access to the Private Network if the fees are not paid within 10 days of the due date); (vi) the continued use of the Services by the Customer may adversely impact the Services or the systems or content of any other Pagoda Box customer, (vii) Pagoda Box reasonably believes that the use of the Services by Customer may subject Pagoda Box, its Affiliates, or any Third Party to liability; or (viii) suspension is required by law, statute, regulation, rule or court order. Pagoda Box will give Customer reasonable advance notice of a suspension under this paragraph and a chance to cure the grounds on which the suspension are based, unless Pagoda Box determines, in Pagoda Box’s reasonable commercial judgment, that a suspension on shorter or contemporaneous notice is necessary to protect Pagoda Box or its other customers from operational, security, or other risk or the suspension is ordered by a court or other judicial body. A violation of the Flow-Through Provision shall be treated the same as a violation of the MSA for this provision. If Pagoda Box suspends the Customer’s right to access or use any portion or all of the Service:\na. Customer remains responsible for all fees and charges Customer has incurred through the date of suspension;\nb. Customer remains responsible for any applicable fees and charges for any Services to which Customer has continued to have access, as well as applicable data storage fees and charges, and fees and charges for in-process tasks completed after the date of suspension;\nc. Customer will not be entitled to any SLA Credits under the Service Level Agreement for any period of suspension; and\nd. At Pagoda Box’s sole discretion, Pagoda Box may terminate Customer’s access to Customer Content stored in the Services during a suspension, and Pagoda Box shall not be liable to Customer for any damages or losses Customer may incur as a result of such suspension.\n \n16. TERM.\n16.1 Term. Except in the case of Hourly Services which are provided based on the number of hours in the Order or as otherwise agreed to by the parties in writing, the term shall commence on the Effective Date and is automatically renewed each Anniversary Billing Date until terminated as provided below.\n \n16.2 Termination for Convenience. Customer may terminate the MSA for convenience at any time as provided in Section 4.1 through the Customer Dashboard. If Customer terminates this MSA for convenience, Customer shall pay Pagoda Box all amounts that would be due on the next Anniversary Date. Pagoda Box may terminate the MSA for convenience upon providing Customer with notice of non-renewal at least 10 days prior to the expiration of the Initial Term or any Renewal Term.\n \n16.3 Termination for Breach. Pagoda Box may terminate the MSA immediately upon notice provided through the Customer Dashboard if: (i) Pagoda Box discovers that the information Customer provided to Pagoda Box about Customer’s proposed use of the Services or Account Information was inaccurate or incomplete; (ii) if Customer is an individual, Customer was not at least 18 years old or otherwise did not have the legal capacity to enter into the MSA, install, or accept Services at the time Customer submitted the Order, or if Customer is an entity, the individual submitting the Order for Customer did not have the legal right or authority to enter into the MSA, install or accept Services on behalf of the person represented to be the Customer; (iii) Customer payment of any invoiced amount is overdue, and Customer does not pay the undisputed overdue amount within 10 days of the due date; (iv) Customer use of the Services or Customer End Users use of the Customer Offering in violation of this MSA and fails to remedy any violation within 10 days of Pagoda Box’s written notice; (v) Customer or Customer End User violates the AUP; (vi) Customer’s account has been suspended for 30 days or more; (vii) Customer has multiple violations of the MSA; or (viii) Customer fails to comply with any other provision of this MSA and does not remedy the failure within 30 days of Pagoda Box notice to Customer describing the failure. Pagoda Box will give Customer written notice of termination under this paragraph unless Pagoda Box determines, in Pagoda Box’s reasonable commercial judgment, that a termination on shorter or contemporaneous notice is necessary to protect Pagoda Box or its other customers from operational, security, or other risks. A breach of the Flow- Through Provision shall be deemed to be a breach of the MSA.\n \n16.4 Access to Customer Content. The deletion of Customer Content is automatic upon termination or expiration of the MSA. Consequently, unless Pagoda Box determines otherwise, Customer will not have access to Customer Content, and Pagoda Box may immediately erase or delete Customer Content from its computer infrastructure after the effective date of termination or expiration of this MSA.\n \n16.5 Effect of Termination. Upon expiration or termination of the MSA, Customer must discontinue use of the Services. Pagoda Box will have no obligation to provide any transition services or access to data except as expressly stated in Section 16.4 above.\n \n17. U.S. GOVERNMENT CUSTOMERS AND U.S. GOVERNMENT RIGHTS. Pagoda Box provides the Services for ultimate federal government end use solely in accordance with the following license rights to use, modify, reproduce, release, perform, display, or disclose: Government technical data and software rights related to the Services include only those rights customarily provided to the public as defined in this MSA. This customary commercial license is provided in accordance with the Federal Acquisition Regulation (“FAR”) at 48 C.F.R. 12.211 (Technical Data) and FAR 12.212 (Software) for civilian agencies of the federal government, and, for Department of Defense transactions, the Defense Federal Acquisition Regulation Supplement (“DFARS”) at 48 C.F.R. 252.227- 7015 (Technical Data – Commercial Items), 48 C.F.R. 227.7202-3 (Rights in Commercial Computer Software or Computer Software Documentation). This U.S. Government Rights clause, consistent with 48 C.F.R. 12.211, 48 C.F.R. 27.212 (federal civilian agencies) or 48 C.F.R. 227.7202-4 (DoD agencies) is in lieu of, and supersedes, any other FAR, DFARS, or other clause or provision that addresses U.S. Government rights in computer software, computer software documentation or technical data related to the Nanobox Commercial Computer Software and Commercial Computer Software Documentation licensed under this MSA or in any contract or subcontract under which this Nanobox Commercial Computer Software and Commercial Computer Software Documentation is acquired or licensed. If a government agency has a need for rights not conveyed under these terms, it must negotiate with Pagoda Box to determine if there are acceptable terms for transferring such rights, and a mutually acceptable written addendum specifically conveying such rights must be included in writing and agreed to by Pagoda Box in any applicable contract or agreement.\n \n18. THIRD PARTIES. Unless otherwise agreed, Pagoda Box will provide support only to Customer, not to Customer End User, Customer Affiliate, Third Party or Third Party Affiliate to whom Customer provides access to use the Services or the Customer Offering. There are no Third Party beneficiaries to the Agreement, meaning that Third Parties do not have any rights against either Pagoda Box or Customer under the MSA.\n \n19. MISCELLANEOUS.\n19.1 Changes to the MSA. As noted in the recitals, Pagoda Box may modify the terms and conditions of this MSA as provided below. Pagoda Box will notify its Customers through the Customer Dashboard of any such modifications and all modifications shall be effective upon their posting on the Customer Dashboard. It is the Customer’s responsibility to review the Customer Dashboard for such modifications on a frequent basis. If Customer continues to use the Services following any such modification such use will be deemed acceptance of such modification by Customer. Any modifications requested by Customer to any of the terms of the MSA must be approved in writing by Pagoda Box.\n \n19.2 Certain Employment Issues. If Customer’s employees or third parties which have been contracted by Customer for rendering contractually agreed services that are in all material respects equivalent to the Services prior to the beginning of this Agreement assert the transfer of their employment relationship or claims thereto against Pagoda Box under EU Directive 2001/23/EC or similar national legislation, Customer shall use its best efforts to either prevent the transfer of the employment relationship or to hold off such claims. Customer shall hold harmless and indemnify Pagoda Box from all prosecution costs incurred in connection with the transfer prevention as well as from any compensation payments to the employee and fees for any external legal counsel, as well as any and all incurred costs and financial claims of the employee or third party that arise from or are due to a claim of further employment or re-employment. These expenses include costs or salary, health insurance, social security contributions, voluntary and legal pension contributions, company pension scheme, pension funds and any severance costs in line with Pagoda Box’s standard generally-applicable policy.\n \n19.3 Notices. Customer communications regarding the Services should be sent by electronic mail to support@nanobox.com except for the following types of notices: for breach, indemnification, or other non-routine legal matters, Customer should send it by electronic mail and first-class United States mail to:\nPagoda Box, Inc.\nC/O Legal Department\n22 North 2nd East\nRexburg, ID 83440\nEmail: legal@nanobox.com\nPagoda Box’s communications regarding the Services and legal notices will be sent through the Customer Dashboard. Notices are deemed received as of the time delivered. Notices must be given in the English language.\n \n19.4 Export Matters. If Customer chooses to use these Services, Customer does so on its own initiative and is responsible for compliance with applicable laws. Customer agrees to comply with all restrictions and regulations of the U.S. Department of Commerce and any other United States or foreign agencies and authorities in connection with Customer’s use of these Services and to not, in violation of any laws, transfer, or authorize the transfer, of any Services (a) into any U.S. and/or U.N. embargoed countries or (b) to anyone on the U.S. Treasury Department’s List of Specially Designated Nationals or the U.S. Commerce Department’s Table of Denial Orders or Entity List of proliferation concern, or the U.S. State Department’s Debarred Parties List. By using these Services, Customer represents and warrants that Customer is not located in, under the control of, or a national or resident of any such country or on any such list. In addition, Customer may not use the Services for the development, design, manufacture, production, stockpiling, or use of nuclear, chemical or biological weapons, weapons of mass destruction, or missiles, in a country listed in Country Groups D: 4 and D: 3, as set forth in Supplement No. 1 to the Part 740 of the United States Export Administration Regulations. Customer assumes responsibility for compliance with laws and regulations applicable to export, re-export or import of products, technology or technical data provided hereunder and for obtaining required export and import authorizations. Customer will not transfer to or through the Services any data, materials or other items controlled for export under the International Traffic in Arms Regulations (“ITAR Data”) or other applicable laws unless Pagoda Box has agreed to the transfer and (i) Customer has provided Pagoda Box not less than 10 days’ prior written notice that ITAR Data will be transferred to or through the Services, (ii) Customer has received prior written authorization from the U.S. Government to transfer the ITAR Data to Pagoda Box, and (iii) Customer agrees to provide Pagoda Box with all necessary assistance to enable Pagoda Box to obtain such U.S. Government permission. Customer is responsible, and will reimburse Pagoda Box, for all costs, expenses or damages incurred by Pagoda Box in connection with Customer transfer of ITAR Data.\n \n19.5 Assignment/Subcontractors. Customer may not assign the MSA or Customer rights and/or delegate Customer obligations under the MSA without Pagoda Box’s prior written consent. Any assignment or transfer of the MSA by Customer in violation of this section will be void. Pagoda Box may assign the MSA to (i) its Affiliates and (ii) any entity as a result of a merger or sale of all or substantially all of the assets of Pagoda Box to such entity and such entity agrees in writing to be bound by the terms of the MSA. This MSA will be binding on and inure to the benefit of Customer’s and Pagoda Box’s respective permitted successors and permitted assigns. However, Pagoda Box may use Third Parties or Affiliates to provide all or part of the Services. This provision does not apply to the Third Party Services which are governed by separate agreements.\n \n19.6 Force Majeure. Except for its rights in Sections 15 or 16, neither Pagoda Box nor Customer will be in violation of the Agreement if the failure to perform the obligation is due to an event beyond either party’s control, such as significant failure of a part of the power grid, sabotage, denial of service attack, significant failure of the Internet, natural disaster, war, riot, insurrection, epidemic, strikes or other organized labor action, terrorism, or other events of a magnitude or type for which precautions are not generally taken in the industry; provided however if the force majeure event continues beyond thirty (30) days, the performing party may terminate the MSA.\n \n19.7 Feedback. Pagoda Box shall own all right, title and interest in and to Feedback. Upon providing the Feedback, Customer hereby irrevocably assigns to Pagoda Box all right, title, and interest in and to the intellectual property rights in the Feedback and agrees to provide Pagoda Box with any assistance Pagoda Box may require to document, perfect, and maintain Pagoda Box’s rights in the Feedback.\n \n19.8 Governing Law, Lawsuits. The MSA is governed by the laws of the State of Idaho, exclusive of any Idaho choice of law principle that would require the application of the law of a different jurisdiction, and the laws of the United States of America, as applicable. The application to the MSA of the United Nations Convention on the International Sale of Goods is excluded in its entirety. The exclusive venue for all disputes arising out of the MSA shall be in the state or federal courts in Madison County, Idaho, and the parties each agree not to bring an action in any other venue. Customer waives all objections to this venue and agrees not to dispute personal jurisdiction or venue in these courts.\n \n19.9 Relationship of the Parties. The parties’ relationship is that of independent contractors and not business partners. Neither of the parties is the agent for the other, and neither party has the right to bind the other on any agreement with a Third Party.\n \n19.10 No Waiver. Pagoda Box’s failure to exercise or delay in exercising any of its rights under this MSA will not constitute a waiver, forfeiture, or modification of such rights. Pagoda Box’s waiver of any right under this MSA will not constitute a waiver of any other right under this Agreement or of the same right on another occasion. Pagoda Box’s waiver of any right under this MSA must be in writing.\n \n19.11 Survival. All provisions that by their nature are intended to survive expiration or termination of the MSA shall survive expiration or termination of the MSA.\n \n19.12 Integration. This MSA is the complete and exclusive agreement between Customer and Pagoda Box regarding its subject matter and supersedes and replaces any agreement, understanding, or communication, whether written or oral, prior or contemporaneous.\n \n19.13 Severability. If any part of this MSA is found unenforceable by a court or other tribunal, the rest of the MSA will nonetheless continue in effect, and the parties agree that any court or other tribunal may reform the unenforceable part if it is possible to do so consistent with the material economic incentives of the parties resulting in this MSA.\n \n19.14 Language. The official language of the MSA shall be the English language and no translation into any other language may be used in its interpretation. All services, support, notices, designations, specifications, and communications will be provided in the English language. \n \n \n*****************\nSERVICE LEVEL AGREEMENT\nThe SLA is incorporated into the MSA and applicable to all Services delivered to Customers. This SLA does not apply to the availability of Third Party Services which are subject to the TPS Agreements and does not apply to Third Parties or to Customer End Users. The issuance of SLA Credits (defined below) is the sole and exclusive remedy of Customer and Pagoda Box’s sole and exclusive obligation, for any failure by Pagoda Box to satisfy the requirements set forth in this SLA.\n \nSupport\n1. Documentation: Free technical documentation is available through the Nanobox Support Site located at www.nanobox.io/docs.\n \n2. Support Requests: Pagoda Box provides support coverage from 8am - 5pm Mountain Time, Monday - Friday, excluding US Holidays. Support inquiries may be submitted at any time via electronic mail to support@nanobox.com, which will generate a support ticket. \n \nGeneral Support\nThe following support requests are covered under General Support:\n• General how-to questions, and providing pointers to documentation\n• Installation and Configuration Questions\n• Troubleshooting issues preventing an application from running on Nanobox\n• Troubleshooting features showing erratic or faulty behavior on Nanobox, independent of the user’s application code\n \nNot Covered\nThe following support requests are not covered under General Support:\n• General debugging of user applications\n• Writing application code for Nanobox compatibility\n• Modifying third party or Open Source software for Nanobox compatibility\n \n3. Outages.  Nanobox servers and networks are monitored 24x7x365 by automated systems. Outages affecting the Services are diagnosed and corrected as quickly as possible.. \n \n4. Data Backup: Data Backups are not currently available through Nanobox. Customer is solely responsible for ensuring that data is backed up in the event of an outage. There is no resolution guarantee and no guarantee of backup integrity.\n \n5. Uptime and Monitoring: We guarantee that our uptime will be commercially reasonable under the circumstances, and that we will always use our best efforts to minimize downtime.\n \n6. SLA Guarantee:  If it seems appropriate to us to do so, we may elect to take measures to compensate our Customers for outages, whether or not the particular incident exceeded our promise of commercially reasonable uptime.  In doing so, we are not necessarily agreeing that the downtime or outage was our fault, was unreasonable, rendered the Services unfit for any particular purpose, or that there is or was otherwise any flaw in our Services or the delivery thereof.  Any such compensation awarded will be made solely in the form of SLA Credits, and will remain in our sole and exclusive discretion.\n \n8. Maintenance: “Maintenance” means: A) NANOBOX MAINTENANCE WINDOWS: upgrades or repairs to infrastructure that we scheduled at least 72 hours in advance and that occurs during off peak hours in the time zone where the data center is located; B) SCHEDULED CUSTOMER MAINTENANCE: maintenance of your configuration that you request and that we schedule with you in advance (either on a case by case basis, or based on standing instructions), such as hardware or software upgrades; C) EMERGENCY MAINTENANCE: critical unforeseen maintenance needed for the security or performance of your configuration or Pagoda Box’s network. We require that all servers remain patched to the approved patch level. You are not entitled to SLA Credits for downtime or outages resulting from Maintenance. \n \nLimitations on Credits\n9. Cumulative Dollar Amount: Notwithstanding anything in this SLA to the contrary, the maximum total credit awarded by Pagoda Box for any calendar month will not exceed 50% of your monthly recurring fee for the affected hosted system. \n \n10. Force Majeure/Extraordinary Events: Pagoda Box will not award credit for downtime or outages resulting from an event of Force Majeure (as described in Section 19.6 of the TOS), denial of service attacks, virus attacks, hacking attempts, and/or any other circumstances that are not within our control.\n \n11. Your Breach of the Agreement: You cannot receive a credit if you are in breach of the Agreement at the time of the occurrence of the event giving rise to the credit until you have cured the breach. You cannot receive a credit if the event giving rise to the credit would not have occurred but for your breach of the Agreement.\n \n12. Data Center Upgrades: Softlayer is constantly upgrading data center facilities, and in order for you to benefit from these upgrades, you agree that we may relocate your servers within Softlayer data centers, make changes to the provision of the Services, and may establish new procedures for the use of the Services. In each case we will give you reasonable advance notice and use all reasonable endeavors to minimize the effect that such change will have on your use of the Services.\n \n \n***************\nACCEPTABLE USE POLICY\nGeneral Statement: Pagoda Box is dedicated to the use of the Internet to improve the lives of individuals throughout the world. Our goal is to deliver enterprise quality on-demand IT Services to all of our Customers at a reasonable price and make available the benefits of the Internet as broadly as possible. The purpose of this AUP is to inform all Customers of the acceptable uses of the Services. Pagoda Box is committed to encouraging the use of the Internet through its Services and Third Party Services, but such use must be consistent with the laws and regulations governing use of the Internet and must protect the right of its other customers to use its Services. The AUP is designed to achieve these goals. Customer agrees to comply with the AUP and is responsible for the use of the Services and Third Party Services by all entities and individuals whom Customer permits to use the Services, Third Party Services or the Customer Offering. In addition to its rights under Section 19.1 of the Terms of Service, Pagoda Box has the right to change or modify the terms of the AUP at any time, effective when posted to the Customer Dashboard. Customer’s use of the Services or Third Party Services after changes to the AUP are posted shall constitute acceptance of any changed or additional terms.\n \nPublic Network: The Public Network of Pagoda Box provides public Internet access to Customer servers and data storage services on Pagoda Box’s network. All Customers are granted equal access to the Public Network.\n \nPrivate Network: The Private Network of Pagoda Box provides Customer with secure private network connectivity from Customer’s private back end network directly to Customer servers and data storage devices on Pagoda Box’s internal network and to other Services. Customer may use the Private Network to upload/download content, retrieve data, and otherwise manage the Customer Content. The Private Network can also be utilized for access during periods of temporary suspension of Services to Customer as provided under the MSA. \n \nProhibited Uses: The following list provides a number of general prohibited uses of the Services and/or Third Party Services that are violations of this AUP. Please note that the following list does not represent a comprehensive or complete list of all prohibited uses.\n \n1. Unlawful Activities. The Services and/or Third Party Services shall not be used in violation of any criminal, civil or administrative violation of any applicable local, state, provincial, federal, national or international law, treaty, court order, ordinance, regulation or administrative rule. This includes, but is not limited to:\na) Child pornography\nb) Unlawful gambling activities\nc) Threats, harassment and abuse of any individual, organization or business\nd) Fraudulent activities\ne) Terrorist websites or other sites advocating human violence and hate crimes based upon religion, ethnicity or country of origin\nf) Unlawful high yield investment plans, Ponzi schemes or linking to and or advertising such schemes\n \n2. Pornography and Child Pornography: In particular, the Services and/or Third Party Services shall not be used to publish, submit, receive, upload, download, post, use, copy or otherwise produce, transmit, distribute or store pornography or child pornography.\n \n3. Unsolicited Email: The use of the Services and/or Third Party Services to send or receive mass unsolicited email (“SPAM”). This prohibition includes the direct sending and receiving of such messages, support of such messages via web page, splash page or other related sites, or the advertisement of such services. The falsifying of packet header, sender, or user information whether in whole or in part to mask the identity of the sender, originator or point of origin or knowingly deleting any author attributions, legal notices or proprietary designations or labels in a file that the Customer mails or sends.\n \n4. Email Bombing: The sending, return, bouncing or forwarding of email to specified user(s) in an attempt to interfere with or overflow email services.\n \n5. Proxy Email: The use of the Services and/or Third Party Services as a proxy email server to forward email to unrelated Third Parties.\n \n6. UseNet SPAM: The use of Services to send, receive, forward, or post UseNet unsolicited email or posts. This includes UseNet services located within the Pagoda Box network or unrelated networks of Third Parties.\n \n7. Hacking: The use of the Services and/or Third Party Services or hacking, attacking, gaining access to, breaching, circumventing or testing the vulnerability of the user authentication or security of any host, network, server, personal computer, network access and control devices, software or data without express authorization of the owner of the system or network.\n \n8. Threatening Material or Content: The Services and/or Third Party Services shall not be used to host, post, transmit, or retransmit any content or material that harasses, or threatens the health or safety of others. In addition, Pagoda Box reserves the right to decline to provide Services and/or Third Party Services if the content is determined by Pagoda Box to be obscene, indecent, hateful, malicious, racist, defamatory, fraudulent, libelous, treasonous, excessively violent or promoting the use of violence or otherwise harmful to others.\n \n9. Violation of Intellectual Property Rights: The Services and/or Third Party Services shall not be used to publish, submit/receive, upload/download, post, use, copy or otherwise reproduce, transmit, retransmit, distribute or store any content/material or to engage in any activity that infringes, misappropriates or otherwise violates the intellectual property rights or privacy or publicity rights of Pagoda Box or any other party, including but not limited to any rights protected by any copyright, patent, trademark laws, trade secret, trade dress, right of privacy, right of publicity, moral rights or other intellectual property right now known or later recognized by statute, judicial decision or regulation. Please file complaints or counter notifications related to copyright or trademark claims via electronic mail sent to legal@nanobox.com.\n \n10. Distribution of Malware: The storage, distribution, fabrication, or use of malware, including without limitation, virus software, root kits, password crackers, adware, key stroke capture programs and other programs normally used in malicious activity is prohibited. The use of such programs in the normal ordinary course of business, however, may be requested by Customer and approved by Pagoda Box on a case by case basis. Example: Security company using the Services to analyze the latest root kit for new security analysis/software.\n \n11. Phishing: Any activity designed to collect personal information (name, account numbers, usernames, passwords, etc.) under false pretense. Splash pages, phishing forms, email distribution, proxy email or any activity related to phishing activities may result in the immediate suspension of Customer’s account.\n \n12. Violation of Agreements relating for Third Party Services. Any activity which violates any TPS Agreements.\n \n13. Denial of Service. Any activity to implement or assist in the implementation of denial of service attack. Pagoda Box absolutely prohibits the use of Services for the origination, propagation or control of denial of service attacks (“DoS”) or distributed denial of service attacks (“DDoS”). Customers may not utilize the Services to perform DoS or DDoS mitigation activities (such as service proxying or data scrubbing) which may result in attracting inbound denial of service attacks toward the Services. Any relation to DoS or DDoS type activity is a direct violation of Pagoda Box’s AUP.\n \nReporting Violation of the Acceptable Use Policy: Pagoda Box accepts reports of alleged violations of this AUP via email sent to abuse@nanobox.com. Reports of alleged violations must be verified and must include the name and contact information of the complaining party, and the IP address or website allegedly in violation, and a description of the alleged violation. Unless otherwise required by law, such as the DMCA, Pagoda Box owes no duty to Third Parties reporting alleged violations. Pagoda Box will review all verified Third Party reports and will take such actions as it deems appropriate in its sole discretion.\n \nPagoda Box will comply with and respond to valid (as Pagoda Box determines in its sole discretion) subpoenas, warrants, and/or court orders. If permitted by applicable law or regulation, Pagoda Box will forward such subpoenas, warrants, and/or orders to Customer and Customer may respond; however, Pagoda Box reserves the right to respond to any such subpoena, warrant and/or order if it is the named party in such subpoena, warrant, and/or order.\n \nNormal Methods of Resolution for Violations of Nanobox’s Acceptable Use Policy\nThe goal of our Normal Methods of Resolution is to mitigate service interruptions while resolving potential violations under this AUP.  Our sales, support and abuse staffs are dedicated to working with the Customer in resolving potential violations, and are available via support ticket / email. The Normal Methods of Resolution below is provided for informational purposes only and forms the framework and guidance with respect to resolving potential violations.  However, Pagoda Box reserves the right to take immediate action to address any violation of its Acceptable Use Policy at any time in its sole discretion, and you should not assume that any particular violation of the AUP will be handled as set forth below.  Even for violations that are handled in accordance with these procedures, timing, order, and speed of these procedures for resolution may differ according to the degree of the violation, the nature of the violation, involvement of law enforcement, involvement of third party litigation, or other related factors.\n \nStep 1: First alleged violation of AUP: a ticket will be generated under Pagoda Box to provide the Customer’s master user with information regarding the potential violation of the Nanobox AUP. This is often a fact-finding email requiring further information or notifying Customer of the potential violation and the required actions to resolve the issue.\n \nStep 2: Acknowledgment of violation of AUP: a ticket is generated under the Customer’s user account with information specific to the violation. This ticket will also include any additional facts about the situation and will notify Customer of the action required to resolve the violation.\n \nStep 3: Violation of AUP disregarded, not properly addressed, or continuing violation if a ticket has been disregarded, not properly addressed, or resolved by the Customer for a specified period of time: Pagoda Box engineers will turn the public network port to the specified dedicated services off. Access to the dedicated services may then be achieved through the secure private service network for Customer resolution. As soon as the violation is addressed, the public access shall be restored and service will continue as normal.\n \nStep 4: Failure to address violation and resolve violation: if Customer fails to address the violation AND fails to resolve the violation, a suspension of services shall occur. This is a last resort for Pagoda Box and only results when the Customer completely fails to participate in Pagoda Box’s resolution process. A permanent suspension of services includes reclamation of all dedicated services and the destruction of Customer’s data.\n \nDisclaimer: Pagoda Box retains the right, at its sole discretion, to refuse new service to any individual, group, or business. Pagoda Box also retains the right to discontinue service to Customers with excessive and/or multiple repeated violations.\n \n***************\nPRIVACY AGREEMENT \nPagoda Box considers user privacy paramount, and Pagoda Box utilizes great care in keeping the information of the users of the Site (including Customers) (“Users” or “You”) private and secure. To demonstrate our firm commitment to privacy, the following agreement has been created to explain our policies and procedures in relation to all data collected. In this Privacy Agreement (“PA”) we describe the information that we collect; how we use, disclose, and share your information; and how we protect your information. Capitalized terms not defined in the PA are defined in the Terms of Service. This PA does not apply to Third Party Services which are governed by their own privacy policies.\n \nTypes of Data Collected\nPagoda Box collects data related to our users through the following methods:\n• Automated means such as communication protocols and cookies\n• Online registration and online signup forms\n• Sales inquiries and transactions\n• Online Customer communications\n• Offline communications and interactions\n• Third party sources of information\n \nDepending upon the method of collection and use, the data collected may include information about the User from forms, registrations and transactions (such as name, title, address, company, phone number and e-mail address), financial/transaction information (such as credit card, card verification value (cvv), and payment information), information about use of Site (such as electronic communications protocols, web pages visited, and cookies) and User preferences and privileges.\n \nElectronic Communications Protocols and Cookies\nPagoda Box may receive data from you as part of the communication connection itself through the standard electronic greeting between your computer and our servers. This information often consists of network routing (where you came from), equipment information (browser type), internet protocol address, date and time. At this time our server will also query your computer to see if there are “cookies” previously set by nanobox.io to facilitate log in or other site navigation procedures. A “cookie” is a small piece of information sent by a web server to store in a web browser so it can later be read back from that browser.\n \nCookies: Some parts of the Site use cookies (including signup forms) to collect information about visitors’ use of the Site and to facilitate return visits. The information collected from cookies is tracked to enhance security and/or to improve the functionality of the Site by avoiding duplicate data entry, facilitating navigation, and increasing the relevance of content.\nCookies on the Site may collect the following information: a unique identifier, User preferences and profile information used to personalize the content that is shown, and User information to access Nanobox’s user forums. Some cookies used by nanobox.io may remain on the user’s computer after they leave the Site, but the majority is set to expire within sixty (“60”) minutes. Cookies may also be of benefit to you by creating a more streamlined login process, keeping track of shopping cart additions or preserving order information between sessions. In the future, as we enable further customization of the Site, cookies will help in ensuring that information provided to you will be the most relevant to your needs.\n \nBrowsers provide you with information and control over cookies. You can set your web browser to alert you when a cookie is being used. You can also get information on the duration of the cookie and what server your data is being returned to. You then have the opportunity to accept or reject the cookie. Additionally, you can set your browser to refuse all cookies or accept only cookies returned to the originating servers. You can generally disable the cookie feature on their browser without affecting their ability to use the Site, except in some cases where cookies are used as an essential security feature or to provide functionality necessary for transaction completion.\n \nWe may also engage Third Parties to track and analyze non-personally and personally identifiable website data. To do so, we may permit Third Parties to place cookies on devices of Users of our Site. We use the data collected by such Third Parties to help us administer and improve the quality of the Site and to analyze Site usage. \n \nBy using the Nanobox Services, Customer represents and warrants that Customer is familiar and will comply with any and all state, federal, or international laws, rules, regulations, decisions, or other principles related to PII  or other regulated information which is contained or stored in, processed by, or obtained by any Application or Customer Content which utilizes the Services.  Customer will indemnify Pagoda Box, its officers, employees, shareholders, contractors, and others from and against any suit, claim, damage assessment, or other liability of any kind or sort whatsoever (including without limitation legal fees and costs), which derives in whole or in part from Customer’s use of the Services to collect, process, use, store, maintain, or otherwise handle PII or other regulated information.  \n \nThe Data We Collect and How We Use It\nPagoda Box collects data from users for the following purposes:\n \n• To engage in transactions for service. Name, address, email, purchase details, and credit card/payment information may be collected and stored as part of the transaction history. The majority of the data collected under this category is contact information. Pagoda Box may need to share some of this data (address, payment) with credit card clearing houses, banking institutions, and other similarly situated Agents, who may require the information in order to complete the transaction (as used here, “Agents” are persons or companies who act on behalf of or under the direction of Pagoda Box). \n \n• To provide future service and support. Information collected for this purpose is both contact data and information related to products and service/support requested. This information is also used to provide service, product update, and similar notices.\n \n• To select content, data may be collected to help create Site content and navigation that is most relevant and user friendly. This includes data collected as a result of site navigation, as well as data provided in forms.\n \n• To respond to user inquiries and requests for information. This data includes registrations for online newsletters, opt-in mailing lists and specific requests for further information.\n \n• To respond to law enforcement organizations, government officials, third parties when compelled by subpoena, court order, or applicable law, or to report or prevent suspected fraudulent or illegal activity in the use of the Services. Pagoda Box will notify Customer of the information request or submission as, and if, allowed.\n \n• To our contractors who provide services or perform functions on our behalf.\n \n• If we are acquired by or merged with another company, if substantially all of our assets are transferred to another company, or as part of a bankruptcy proceeding, we may transfer the information we have collected from you to another entity if applicable.\n \n• To better tailor marketing to User needs. We may use information from User purchases and User-specified requirements to provide you with timely and pertinent notices of Pagoda Box product releases and service developments that address your needs and specified requirements and/or which are similar to products and services previously purchased by the User from Pagoda Box.\n \n• To better respond to requests for service or quotes for product and equipment purchase. Pagoda Box will pass contact information to the appropriate Pagoda Box sales person, or reseller for follow-up related to Pagoda Box products or services.\n \n• From referral “tell a friend” function. If a User elects to use our referral service for informing a friend about our Site, we ask them for the friend’s name and email address. Pagoda Box will automatically send the friend a one-time email inviting them to visit the Site and send a copy of said e-mail to the User. The e-mail(s) sent shall clearly identify the sender of such email(s). Pagoda Box uses this data for the sole purpose of sending this onetime email. Such email sent to a friend at User’s request will not be stored for additional processing.\n \n• As a result of your participation in interactive discussions and public forums. There are parts of the Site that permit you to participate in interactive discussions. Some of these are moderated; all are subject to access for technical reasons. Pagoda Box does not control the content that Users post and some may serve as public discussion forums. As in any interactive forum open to many Users, you should carefully consider whether you wish to submit data and should tailor any other content submitted accordingly.\n \nCustomer Dashboard, Customer Customization, Preferences and Opt-Out\n \nNew Customers are automatically registered for access at dashboard.nanobox.io/users/register. The Customer Dashboard allows Customers the ability to create accounts and opt in (or out) of Services and mailing lists. The Customer Dashboard provides the Customers with control over their preferences for electronic information delivery.\n \nPagoda Box has also provided the Customer’s master user the ability to manage the Customer’s Account Information. We maintain the data and allow the Customer’s master user to update it at any time. To change this information, you must be a current Customer and login with a user ID and password and follow the prompts to “update my profile” on the Customer Dashboard. We continue to expand the profile of Services and information that you may access and update.\n \nPlease note that some email communications are not subject to general opt-out. These include communications related to downloads; communications about sales transactions; information about software updates, patches and fixes; disclosures to comply with legal requirements; and network upgrades or other related maintenance for Service.\n \nIf an individual’s PII is to be (a) disclosed by Pagoda Box (other than as the result of an Application or Customer Content utilizing the Services) to a Third Party who is not an Agent; or (b) used by Pagoda Box (other than as a result of an Application or Customer Content utilizing the Services)  for a purpose that is incompatible with the purpose(s) for which it was originally collected or subsequently authorized by the individual, then the individual will be notified prior to such disclosure and may opt-out of the disclosure by responding to the email and/or author of the notification, using any response method designated by Pagoda Box in the notification..\n \nSecurity\nPagoda Box is concerned with the security of the data we have collected and utilizes commercially reasonable measures to prevent unauthorized access to that information. These measures include policies, procedures, employee training, physical access and technical elements relating to data access controls. In addition, Pagoda Box uses standard security protocols and mechanisms to facilitate the exchange and the transmission of sensitive data, such as credit card details. Pagoda Box does not process PII in a way that is incompatible with the purposes for which it has been collected or subsequently authorized by the individual.\n \nIn the event that PII is acquired, or is reasonably believed to have been acquired, by an unauthorized person and applicable law requires notification, Pagoda Box will notify the affected individual of the breach by email or ticket on the Customer Dashboard or, if Pagoda Box is unable to contact the individual by email or ticket on the Customer Dashboard, then by regular mail. Notice will be given promptly, consistent with the legitimate needs of law enforcement and any measures necessary for Pagoda Box or law enforcement to determine the scope of the breach and to ensure or restore the integrity of the data system. Pagoda Box may delay notification if Pagoda Box or a law enforcement agency determines that the notification will impede a criminal investigation, and in such case, notification will not be provided unless and until Pagoda Box or the agency determines that notification will not compromise the investigation.\n \nEnforcement\nPagoda Box has established internal mechanisms to verify its ongoing adherence to its privacy policy. Pagoda Box also encourages individuals covered by this privacy policy to raise any concerns about our processing of personal information by contacting Pagoda Box at the address below. Pagoda Box will seek to resolve any concerns. \n \nPolicy Updates\nIf we are going to use your PII in a manner different from that stated at the time of collection, we will notify you via email. In addition, if we make any material changes in our privacy practices that do not affect the PII already stored in our database, we will notify you by email or post a prominent notice on the Customer Dashboard notifying users of the change. In some cases, when we post the notice, we will also email users who have opted to receive communications from us, notifying them of the changes in our privacy practices. We may update this policy from time to time to describe how new site features affect our use of your PII and to let you know of new control and preference features that we provide.\n \nContact Information and Inspection Rights\nQuestions, concerns or comments about this privacy policy should be addressed to:\n \nLegal Department\nPagoda Box Inc.\n237 N 2nd E, Suite 106\nRexburg, ID 83440\n \nIf at any time you decide that you no longer desire that we hold, use, correct or supplement any of your PII, receive information regarding any PII processed in relation to you or you wish to change the manner in which your PII may be used, please let us know by contacting us as set forth above.</pre>");;return buf.join("");
};

/**
 * History.js Core
 * @author Benjamin Arthur Lupton <contact@balupton.com>
 * @copyright 2010-2011 Benjamin Arthur Lupton <contact@balupton.com>
 * @license New BSD License <http://creativecommons.org/licenses/BSD/>
 */

(function(window,undefined){
	"use strict";

	// ========================================================================
	// Initialise

	// Localise Globals
	var
		console = window.console||undefined, // Prevent a JSLint complain
		document = window.document, // Make sure we are using the correct document
		navigator = window.navigator, // Make sure we are using the correct navigator
		sessionStorage = window.sessionStorage||false, // sessionStorage
		setTimeout = window.setTimeout,
		clearTimeout = window.clearTimeout,
		setInterval = window.setInterval,
		clearInterval = window.clearInterval,
		JSON = window.JSON,
		alert = window.alert,
		History = window.History = window.History||{}, // Public History Object
		history = window.history; // Old History Object

	try {
		sessionStorage.setItem('TEST', '1');
		sessionStorage.removeItem('TEST');
	} catch(e) {
		sessionStorage = false;
	}

	// MooTools Compatibility
	JSON.stringify = JSON.stringify||JSON.encode;
	JSON.parse = JSON.parse||JSON.decode;

	// Check Existence
	if ( typeof History.init !== 'undefined' ) {
		throw new Error('History.js Core has already been loaded...');
	}

	// Initialise History
	History.init = function(options){
		// Check Load Status of Adapter
		if ( typeof History.Adapter === 'undefined' ) {
			return false;
		}

		// Check Load Status of Core
		if ( typeof History.initCore !== 'undefined' ) {
			History.initCore();
		}

		// Check Load Status of HTML4 Support
		if ( typeof History.initHtml4 !== 'undefined' ) {
			History.initHtml4();
		}

		// Return true
		return true;
	};


	// ========================================================================
	// Initialise Core

	// Initialise Core
	History.initCore = function(options){
		// Initialise
		if ( typeof History.initCore.initialized !== 'undefined' ) {
			// Already Loaded
			return false;
		}
		else {
			History.initCore.initialized = true;
		}


		// ====================================================================
		// Options

		/**
		 * History.options
		 * Configurable options
		 */
		History.options = History.options||{};

		/**
		 * History.options.hashChangeInterval
		 * How long should the interval be before hashchange checks
		 */
		History.options.hashChangeInterval = History.options.hashChangeInterval || 100;

		/**
		 * History.options.safariPollInterval
		 * How long should the interval be before safari poll checks
		 */
		History.options.safariPollInterval = History.options.safariPollInterval || 500;

		/**
		 * History.options.doubleCheckInterval
		 * How long should the interval be before we perform a double check
		 */
		History.options.doubleCheckInterval = History.options.doubleCheckInterval || 500;

		/**
		 * History.options.disableSuid
		 * Force History not to append suid
		 */
		History.options.disableSuid = History.options.disableSuid || false;

		/**
		 * History.options.storeInterval
		 * How long should we wait between store calls
		 */
		History.options.storeInterval = History.options.storeInterval || 1000;

		/**
		 * History.options.busyDelay
		 * How long should we wait between busy events
		 */
		History.options.busyDelay = History.options.busyDelay || 250;

		/**
		 * History.options.debug
		 * If true will enable debug messages to be logged
		 */
		History.options.debug = History.options.debug || false;

		/**
		 * History.options.initialTitle
		 * What is the title of the initial state
		 */
		History.options.initialTitle = History.options.initialTitle || document.title;

		/**
		 * History.options.html4Mode
		 * If true, will force HTMl4 mode (hashtags)
		 */
		History.options.html4Mode = History.options.html4Mode || false;

		/**
		 * History.options.delayInit
		 * Want to override default options and call init manually.
		 */
		History.options.delayInit = History.options.delayInit || false;


		// ====================================================================
		// Interval record

		/**
		 * History.intervalList
		 * List of intervals set, to be cleared when document is unloaded.
		 */
		History.intervalList = [];

		/**
		 * History.clearAllIntervals
		 * Clears all setInterval instances.
		 */
		History.clearAllIntervals = function(){
			var i, il = History.intervalList;
			if (typeof il !== "undefined" && il !== null) {
				for (i = 0; i < il.length; i++) {
					clearInterval(il[i]);
				}
				History.intervalList = null;
			}
		};


		// ====================================================================
		// Debug

		/**
		 * History.debug(message,...)
		 * Logs the passed arguments if debug enabled
		 */
		History.debug = function(){
			if ( (History.options.debug||false) ) {
				History.log.apply(History,arguments);
			}
		};

		/**
		 * History.log(message,...)
		 * Logs the passed arguments
		 */
		History.log = function(){
			// Prepare
			var
				consoleExists = !(typeof console === 'undefined' || typeof console.log === 'undefined' || typeof console.log.apply === 'undefined'),
				textarea = document.getElementById('log'),
				message,
				i,n,
				args,arg
				;

			// Write to Console
			if ( consoleExists ) {
				args = Array.prototype.slice.call(arguments);
				message = args.shift();
				if ( typeof console.debug !== 'undefined' ) {
					console.debug.apply(console,[message,args]);
				}
				else {
					console.log.apply(console,[message,args]);
				}
			}
			else {
				message = ("\n"+arguments[0]+"\n");
			}

			// Write to log
			for ( i=1,n=arguments.length; i<n; ++i ) {
				arg = arguments[i];
				if ( typeof arg === 'object' && typeof JSON !== 'undefined' ) {
					try {
						arg = JSON.stringify(arg);
					}
					catch ( Exception ) {
						// Recursive Object
					}
				}
				message += "\n"+arg+"\n";
			}

			// Textarea
			if ( textarea ) {
				textarea.value += message+"\n-----\n";
				textarea.scrollTop = textarea.scrollHeight - textarea.clientHeight;
			}
			// No Textarea, No Console
			else if ( !consoleExists ) {
				alert(message);
			}

			// Return true
			return true;
		};


		// ====================================================================
		// Emulated Status

		/**
		 * History.getInternetExplorerMajorVersion()
		 * Get's the major version of Internet Explorer
		 * @return {integer}
		 * @license Public Domain
		 * @author Benjamin Arthur Lupton <contact@balupton.com>
		 * @author James Padolsey <https://gist.github.com/527683>
		 */
		History.getInternetExplorerMajorVersion = function(){
			var result = History.getInternetExplorerMajorVersion.cached =
					(typeof History.getInternetExplorerMajorVersion.cached !== 'undefined')
				?	History.getInternetExplorerMajorVersion.cached
				:	(function(){
						var v = 3,
								div = document.createElement('div'),
								all = div.getElementsByTagName('i');
						while ( (div.innerHTML = '<!--[if gt IE ' + (++v) + ']><i></i><![endif]-->') && all[0] ) {}
						return (v > 4) ? v : false;
					})()
				;
			return result;
		};

		/**
		 * History.isInternetExplorer()
		 * Are we using Internet Explorer?
		 * @return {boolean}
		 * @license Public Domain
		 * @author Benjamin Arthur Lupton <contact@balupton.com>
		 */
		History.isInternetExplorer = function(){
			var result =
				History.isInternetExplorer.cached =
				(typeof History.isInternetExplorer.cached !== 'undefined')
					?	History.isInternetExplorer.cached
					:	Boolean(History.getInternetExplorerMajorVersion())
				;
			return result;
		};

		/**
		 * History.emulated
		 * Which features require emulating?
		 */

		if (History.options.html4Mode) {
			History.emulated = {
				pushState : true,
				hashChange: true
			};
		}

		else {

			History.emulated = {
				pushState: !Boolean(
					window.history && window.history.pushState && window.history.replaceState
					&& !(
						(/ Mobile\/([1-7][a-z]|(8([abcde]|f(1[0-8]))))/i).test(navigator.userAgent) /* disable for versions of iOS before version 4.3 (8F190) */
						|| (/AppleWebKit\/5([0-2]|3[0-2])/i).test(navigator.userAgent) /* disable for the mercury iOS browser, or at least older versions of the webkit engine */
					)
				),
				hashChange: Boolean(
					!(('onhashchange' in window) || ('onhashchange' in document))
					||
					(History.isInternetExplorer() && History.getInternetExplorerMajorVersion() < 8)
				)
			};
		}

		/**
		 * History.enabled
		 * Is History enabled?
		 */
		History.enabled = !History.emulated.pushState;

		/**
		 * History.bugs
		 * Which bugs are present
		 */
		History.bugs = {
			/**
			 * Safari 5 and Safari iOS 4 fail to return to the correct state once a hash is replaced by a `replaceState` call
			 * https://bugs.webkit.org/show_bug.cgi?id=56249
			 */
			setHash: Boolean(!History.emulated.pushState && navigator.vendor === 'Apple Computer, Inc.' && /AppleWebKit\/5([0-2]|3[0-3])/.test(navigator.userAgent)),

			/**
			 * Safari 5 and Safari iOS 4 sometimes fail to apply the state change under busy conditions
			 * https://bugs.webkit.org/show_bug.cgi?id=42940
			 */
			safariPoll: Boolean(!History.emulated.pushState && navigator.vendor === 'Apple Computer, Inc.' && /AppleWebKit\/5([0-2]|3[0-3])/.test(navigator.userAgent)),

			/**
			 * MSIE 6 and 7 sometimes do not apply a hash even it was told to (requiring a second call to the apply function)
			 */
			ieDoubleCheck: Boolean(History.isInternetExplorer() && History.getInternetExplorerMajorVersion() < 8),

			/**
			 * MSIE 6 requires the entire hash to be encoded for the hashes to trigger the onHashChange event
			 */
			hashEscape: Boolean(History.isInternetExplorer() && History.getInternetExplorerMajorVersion() < 7)
		};

		/**
		 * History.isEmptyObject(obj)
		 * Checks to see if the Object is Empty
		 * @param {Object} obj
		 * @return {boolean}
		 */
		History.isEmptyObject = function(obj) {
			for ( var name in obj ) {
				if ( obj.hasOwnProperty(name) ) {
					return false;
				}
			}
			return true;
		};

		/**
		 * History.cloneObject(obj)
		 * Clones a object and eliminate all references to the original contexts
		 * @param {Object} obj
		 * @return {Object}
		 */
		History.cloneObject = function(obj) {
			var hash,newObj;
			if ( obj ) {
				hash = JSON.stringify(obj);
				newObj = JSON.parse(hash);
			}
			else {
				newObj = {};
			}
			return newObj;
		};


		// ====================================================================
		// URL Helpers

		/**
		 * History.getRootUrl()
		 * Turns "http://mysite.com/dir/page.html?asd" into "http://mysite.com"
		 * @return {String} rootUrl
		 */
		History.getRootUrl = function(){
			// Create
			var rootUrl = document.location.protocol+'//'+(document.location.hostname||document.location.host);
			if ( document.location.port||false ) {
				rootUrl += ':'+document.location.port;
			}
			rootUrl += '/';

			// Return
			return rootUrl;
		};

		/**
		 * History.getBaseHref()
		 * Fetches the `href` attribute of the `<base href="...">` element if it exists
		 * @return {String} baseHref
		 */
		History.getBaseHref = function(){
			// Create
			var
				baseElements = document.getElementsByTagName('base'),
				baseElement = null,
				baseHref = '';

			// Test for Base Element
			if ( baseElements.length === 1 ) {
				// Prepare for Base Element
				baseElement = baseElements[0];
				baseHref = baseElement.href.replace(/[^\/]+$/,'');
			}

			// Adjust trailing slash
			baseHref = baseHref.replace(/\/+$/,'');
			if ( baseHref ) baseHref += '/';

			// Return
			return baseHref;
		};

		/**
		 * History.getBaseUrl()
		 * Fetches the baseHref or basePageUrl or rootUrl (whichever one exists first)
		 * @return {String} baseUrl
		 */
		History.getBaseUrl = function(){
			// Create
			var baseUrl = History.getBaseHref()||History.getBasePageUrl()||History.getRootUrl();

			// Return
			return baseUrl;
		};

		/**
		 * History.getPageUrl()
		 * Fetches the URL of the current page
		 * @return {String} pageUrl
		 */
		History.getPageUrl = function(){
			// Fetch
			var
				State = History.getState(false,false),
				stateUrl = (State||{}).url||History.getLocationHref(),
				pageUrl;

			// Create
			pageUrl = stateUrl.replace(/\/+$/,'').replace(/[^\/]+$/,function(part,index,string){
				return (/\./).test(part) ? part : part+'/';
			});

			// Return
			return pageUrl;
		};

		/**
		 * History.getBasePageUrl()
		 * Fetches the Url of the directory of the current page
		 * @return {String} basePageUrl
		 */
		History.getBasePageUrl = function(){
			// Create
			var basePageUrl = (History.getLocationHref()).replace(/[#\?].*/,'').replace(/[^\/]+$/,function(part,index,string){
				return (/[^\/]$/).test(part) ? '' : part;
			}).replace(/\/+$/,'')+'/';

			// Return
			return basePageUrl;
		};

		/**
		 * History.getFullUrl(url)
		 * Ensures that we have an absolute URL and not a relative URL
		 * @param {string} url
		 * @param {Boolean} allowBaseHref
		 * @return {string} fullUrl
		 */
		History.getFullUrl = function(url,allowBaseHref){
			// Prepare
			var fullUrl = url, firstChar = url.substring(0,1);
			allowBaseHref = (typeof allowBaseHref === 'undefined') ? true : allowBaseHref;

			// Check
			if ( /[a-z]+\:\/\//.test(url) ) {
				// Full URL
			}
			else if ( firstChar === '/' ) {
				// Root URL
				fullUrl = History.getRootUrl()+url.replace(/^\/+/,'');
			}
			else if ( firstChar === '#' ) {
				// Anchor URL
				fullUrl = History.getPageUrl().replace(/#.*/,'')+url;
			}
			else if ( firstChar === '?' ) {
				// Query URL
				fullUrl = History.getPageUrl().replace(/[\?#].*/,'')+url;
			}
			else {
				// Relative URL
				if ( allowBaseHref ) {
					fullUrl = History.getBaseUrl()+url.replace(/^(\.\/)+/,'');
				} else {
					fullUrl = History.getBasePageUrl()+url.replace(/^(\.\/)+/,'');
				}
				// We have an if condition above as we do not want hashes
				// which are relative to the baseHref in our URLs
				// as if the baseHref changes, then all our bookmarks
				// would now point to different locations
				// whereas the basePageUrl will always stay the same
			}

			// Return
			return fullUrl.replace(/\#$/,'');
		};

		/**
		 * History.getShortUrl(url)
		 * Ensures that we have a relative URL and not a absolute URL
		 * @param {string} url
		 * @return {string} url
		 */
		History.getShortUrl = function(url){
			// Prepare
			var shortUrl = url, baseUrl = History.getBaseUrl(), rootUrl = History.getRootUrl();

			// Trim baseUrl
			if ( History.emulated.pushState ) {
				// We are in a if statement as when pushState is not emulated
				// The actual url these short urls are relative to can change
				// So within the same session, we the url may end up somewhere different
				shortUrl = shortUrl.replace(baseUrl,'');
			}

			// Trim rootUrl
			shortUrl = shortUrl.replace(rootUrl,'/');

			// Ensure we can still detect it as a state
			if ( History.isTraditionalAnchor(shortUrl) ) {
				shortUrl = './'+shortUrl;
			}

			// Clean It
			shortUrl = shortUrl.replace(/^(\.\/)+/g,'./').replace(/\#$/,'');

			// Return
			return shortUrl;
		};

		/**
		 * History.getLocationHref(document)
		 * Returns a normalized version of document.location.href
		 * accounting for browser inconsistencies, etc.
		 *
		 * This URL will be URI-encoded and will include the hash
		 *
		 * @param {object} document
		 * @return {string} url
		 */
		History.getLocationHref = function(doc) {
			doc = doc || document;

			// most of the time, this will be true
			if (doc.URL === doc.location.href)
				return doc.location.href;

			// some versions of webkit URI-decode document.location.href
			// but they leave document.URL in an encoded state
			if (doc.location.href === decodeURIComponent(doc.URL))
				return doc.URL;

			// FF 3.6 only updates document.URL when a page is reloaded
			// document.location.href is updated correctly
			if (doc.location.hash && decodeURIComponent(doc.location.href.replace(/^[^#]+/, "")) === doc.location.hash)
				return doc.location.href;

			if (doc.URL.indexOf('#') == -1 && doc.location.href.indexOf('#') != -1)
				return doc.location.href;
			
			return doc.URL || doc.location.href;
		};


		// ====================================================================
		// State Storage

		/**
		 * History.store
		 * The store for all session specific data
		 */
		History.store = {};

		/**
		 * History.idToState
		 * 1-1: State ID to State Object
		 */
		History.idToState = History.idToState||{};

		/**
		 * History.stateToId
		 * 1-1: State String to State ID
		 */
		History.stateToId = History.stateToId||{};

		/**
		 * History.urlToId
		 * 1-1: State URL to State ID
		 */
		History.urlToId = History.urlToId||{};

		/**
		 * History.storedStates
		 * Store the states in an array
		 */
		History.storedStates = History.storedStates||[];

		/**
		 * History.savedStates
		 * Saved the states in an array
		 */
		History.savedStates = History.savedStates||[];

		/**
		 * History.noramlizeStore()
		 * Noramlize the store by adding necessary values
		 */
		History.normalizeStore = function(){
			History.store.idToState = History.store.idToState||{};
			History.store.urlToId = History.store.urlToId||{};
			History.store.stateToId = History.store.stateToId||{};
		};

		/**
		 * History.getState()
		 * Get an object containing the data, title and url of the current state
		 * @param {Boolean} friendly
		 * @param {Boolean} create
		 * @return {Object} State
		 */
		History.getState = function(friendly,create){
			// Prepare
			if ( typeof friendly === 'undefined' ) { friendly = true; }
			if ( typeof create === 'undefined' ) { create = true; }

			// Fetch
			var State = History.getLastSavedState();

			// Create
			if ( !State && create ) {
				State = History.createStateObject();
			}

			// Adjust
			if ( friendly ) {
				State = History.cloneObject(State);
				State.url = State.cleanUrl||State.url;
			}

			// Return
			return State;
		};

		/**
		 * History.getIdByState(State)
		 * Gets a ID for a State
		 * @param {State} newState
		 * @return {String} id
		 */
		History.getIdByState = function(newState){

			// Fetch ID
			var id = History.extractId(newState.url),
				str;

			if ( !id ) {
				// Find ID via State String
				str = History.getStateString(newState);
				if ( typeof History.stateToId[str] !== 'undefined' ) {
					id = History.stateToId[str];
				}
				else if ( typeof History.store.stateToId[str] !== 'undefined' ) {
					id = History.store.stateToId[str];
				}
				else {
					// Generate a new ID
					while ( true ) {
						id = (new Date()).getTime() + String(Math.random()).replace(/\D/g,'');
						if ( typeof History.idToState[id] === 'undefined' && typeof History.store.idToState[id] === 'undefined' ) {
							break;
						}
					}

					// Apply the new State to the ID
					History.stateToId[str] = id;
					History.idToState[id] = newState;
				}
			}

			// Return ID
			return id;
		};

		/**
		 * History.normalizeState(State)
		 * Expands a State Object
		 * @param {object} State
		 * @return {object}
		 */
		History.normalizeState = function(oldState){
			// Variables
			var newState, dataNotEmpty;

			// Prepare
			if ( !oldState || (typeof oldState !== 'object') ) {
				oldState = {};
			}

			// Check
			if ( typeof oldState.normalized !== 'undefined' ) {
				return oldState;
			}

			// Adjust
			if ( !oldState.data || (typeof oldState.data !== 'object') ) {
				oldState.data = {};
			}

			// ----------------------------------------------------------------

			// Create
			newState = {};
			newState.normalized = true;
			newState.title = oldState.title||'';
			newState.url = History.getFullUrl(oldState.url?oldState.url:(History.getLocationHref()));
			newState.hash = History.getShortUrl(newState.url);
			newState.data = History.cloneObject(oldState.data);

			// Fetch ID
			newState.id = History.getIdByState(newState);

			// ----------------------------------------------------------------

			// Clean the URL
			newState.cleanUrl = newState.url.replace(/\??\&_suid.*/,'');
			newState.url = newState.cleanUrl;

			// Check to see if we have more than just a url
			dataNotEmpty = !History.isEmptyObject(newState.data);

			// Apply
			if ( (newState.title || dataNotEmpty) && History.options.disableSuid !== true ) {
				// Add ID to Hash
				newState.hash = History.getShortUrl(newState.url).replace(/\??\&_suid.*/,'');
				if ( !/\?/.test(newState.hash) ) {
					newState.hash += '?';
				}
				newState.hash += '&_suid='+newState.id;
			}

			// Create the Hashed URL
			newState.hashedUrl = History.getFullUrl(newState.hash);

			// ----------------------------------------------------------------

			// Update the URL if we have a duplicate
			if ( (History.emulated.pushState || History.bugs.safariPoll) && History.hasUrlDuplicate(newState) ) {
				newState.url = newState.hashedUrl;
			}

			// ----------------------------------------------------------------

			// Return
			return newState;
		};

		/**
		 * History.createStateObject(data,title,url)
		 * Creates a object based on the data, title and url state params
		 * @param {object} data
		 * @param {string} title
		 * @param {string} url
		 * @return {object}
		 */
		History.createStateObject = function(data,title,url){
			// Hashify
			var State = {
				'data': data,
				'title': title,
				'url': url
			};

			// Expand the State
			State = History.normalizeState(State);

			// Return object
			return State;
		};

		/**
		 * History.getStateById(id)
		 * Get a state by it's UID
		 * @param {String} id
		 */
		History.getStateById = function(id){
			// Prepare
			id = String(id);

			// Retrieve
			var State = History.idToState[id] || History.store.idToState[id] || undefined;

			// Return State
			return State;
		};

		/**
		 * Get a State's String
		 * @param {State} passedState
		 */
		History.getStateString = function(passedState){
			// Prepare
			var State, cleanedState, str;

			// Fetch
			State = History.normalizeState(passedState);

			// Clean
			cleanedState = {
				data: State.data,
				title: passedState.title,
				url: passedState.url
			};

			// Fetch
			str = JSON.stringify(cleanedState);

			// Return
			return str;
		};

		/**
		 * Get a State's ID
		 * @param {State} passedState
		 * @return {String} id
		 */
		History.getStateId = function(passedState){
			// Prepare
			var State, id;

			// Fetch
			State = History.normalizeState(passedState);

			// Fetch
			id = State.id;

			// Return
			return id;
		};

		/**
		 * History.getHashByState(State)
		 * Creates a Hash for the State Object
		 * @param {State} passedState
		 * @return {String} hash
		 */
		History.getHashByState = function(passedState){
			// Prepare
			var State, hash;

			// Fetch
			State = History.normalizeState(passedState);

			// Hash
			hash = State.hash;

			// Return
			return hash;
		};

		/**
		 * History.extractId(url_or_hash)
		 * Get a State ID by it's URL or Hash
		 * @param {string} url_or_hash
		 * @return {string} id
		 */
		History.extractId = function ( url_or_hash ) {
			// Prepare
			var id,parts,url, tmp;

			// Extract
			
			// If the URL has a #, use the id from before the #
			if (url_or_hash.indexOf('#') != -1)
			{
				tmp = url_or_hash.split("#")[0];
			}
			else
			{
				tmp = url_or_hash;
			}
			
			parts = /(.*)\&_suid=([0-9]+)$/.exec(tmp);
			url = parts ? (parts[1]||url_or_hash) : url_or_hash;
			id = parts ? String(parts[2]||'') : '';

			// Return
			return id||false;
		};

		/**
		 * History.isTraditionalAnchor
		 * Checks to see if the url is a traditional anchor or not
		 * @param {String} url_or_hash
		 * @return {Boolean}
		 */
		History.isTraditionalAnchor = function(url_or_hash){
			// Check
			var isTraditional = !(/[\/\?\.]/.test(url_or_hash));

			// Return
			return isTraditional;
		};

		/**
		 * History.extractState
		 * Get a State by it's URL or Hash
		 * @param {String} url_or_hash
		 * @return {State|null}
		 */
		History.extractState = function(url_or_hash,create){
			// Prepare
			var State = null, id, url;
			create = create||false;

			// Fetch SUID
			id = History.extractId(url_or_hash);
			if ( id ) {
				State = History.getStateById(id);
			}

			// Fetch SUID returned no State
			if ( !State ) {
				// Fetch URL
				url = History.getFullUrl(url_or_hash);

				// Check URL
				id = History.getIdByUrl(url)||false;
				if ( id ) {
					State = History.getStateById(id);
				}

				// Create State
				if ( !State && create && !History.isTraditionalAnchor(url_or_hash) ) {
					State = History.createStateObject(null,null,url);
				}
			}

			// Return
			return State;
		};

		/**
		 * History.getIdByUrl()
		 * Get a State ID by a State URL
		 */
		History.getIdByUrl = function(url){
			// Fetch
			var id = History.urlToId[url] || History.store.urlToId[url] || undefined;

			// Return
			return id;
		};

		/**
		 * History.getLastSavedState()
		 * Get an object containing the data, title and url of the current state
		 * @return {Object} State
		 */
		History.getLastSavedState = function(){
			return History.savedStates[History.savedStates.length-1]||undefined;
		};

		/**
		 * History.getLastStoredState()
		 * Get an object containing the data, title and url of the current state
		 * @return {Object} State
		 */
		History.getLastStoredState = function(){
			return History.storedStates[History.storedStates.length-1]||undefined;
		};

		/**
		 * History.hasUrlDuplicate
		 * Checks if a Url will have a url conflict
		 * @param {Object} newState
		 * @return {Boolean} hasDuplicate
		 */
		History.hasUrlDuplicate = function(newState) {
			// Prepare
			var hasDuplicate = false,
				oldState;

			// Fetch
			oldState = History.extractState(newState.url);

			// Check
			hasDuplicate = oldState && oldState.id !== newState.id;

			// Return
			return hasDuplicate;
		};

		/**
		 * History.storeState
		 * Store a State
		 * @param {Object} newState
		 * @return {Object} newState
		 */
		History.storeState = function(newState){
			// Store the State
			History.urlToId[newState.url] = newState.id;

			// Push the State
			History.storedStates.push(History.cloneObject(newState));

			// Return newState
			return newState;
		};

		/**
		 * History.isLastSavedState(newState)
		 * Tests to see if the state is the last state
		 * @param {Object} newState
		 * @return {boolean} isLast
		 */
		History.isLastSavedState = function(newState){
			// Prepare
			var isLast = false,
				newId, oldState, oldId;

			// Check
			if ( History.savedStates.length ) {
				newId = newState.id;
				oldState = History.getLastSavedState();
				oldId = oldState.id;

				// Check
				isLast = (newId === oldId);
			}

			// Return
			return isLast;
		};

		/**
		 * History.saveState
		 * Push a State
		 * @param {Object} newState
		 * @return {boolean} changed
		 */
		History.saveState = function(newState){
			// Check Hash
			if ( History.isLastSavedState(newState) ) {
				return false;
			}

			// Push the State
			History.savedStates.push(History.cloneObject(newState));

			// Return true
			return true;
		};

		/**
		 * History.getStateByIndex()
		 * Gets a state by the index
		 * @param {integer} index
		 * @return {Object}
		 */
		History.getStateByIndex = function(index){
			// Prepare
			var State = null;

			// Handle
			if ( typeof index === 'undefined' ) {
				// Get the last inserted
				State = History.savedStates[History.savedStates.length-1];
			}
			else if ( index < 0 ) {
				// Get from the end
				State = History.savedStates[History.savedStates.length+index];
			}
			else {
				// Get from the beginning
				State = History.savedStates[index];
			}

			// Return State
			return State;
		};
		
		/**
		 * History.getCurrentIndex()
		 * Gets the current index
		 * @return (integer)
		*/
		History.getCurrentIndex = function(){
			// Prepare
			var index = null;
			
			// No states saved
			if(History.savedStates.length < 1) {
				index = 0;
			}
			else {
				index = History.savedStates.length-1;
			}
			return index;
		};

		// ====================================================================
		// Hash Helpers

		/**
		 * History.getHash()
		 * @param {Location=} location
		 * Gets the current document hash
		 * Note: unlike location.hash, this is guaranteed to return the escaped hash in all browsers
		 * @return {string}
		 */
		History.getHash = function(doc){
			var url = History.getLocationHref(doc),
				hash;
			hash = History.getHashByUrl(url);
			return hash;
		};

		/**
		 * History.unescapeHash()
		 * normalize and Unescape a Hash
		 * @param {String} hash
		 * @return {string}
		 */
		History.unescapeHash = function(hash){
			// Prepare
			var result = History.normalizeHash(hash);

			// Unescape hash
			result = decodeURIComponent(result);

			// Return result
			return result;
		};

		/**
		 * History.normalizeHash()
		 * normalize a hash across browsers
		 * @return {string}
		 */
		History.normalizeHash = function(hash){
			// Prepare
			var result = hash.replace(/[^#]*#/,'').replace(/#.*/, '');

			// Return result
			return result;
		};

		/**
		 * History.setHash(hash)
		 * Sets the document hash
		 * @param {string} hash
		 * @return {History}
		 */
		History.setHash = function(hash,queue){
			// Prepare
			var State, pageUrl;

			// Handle Queueing
			if ( queue !== false && History.busy() ) {
				// Wait + Push to Queue
				//History.debug('History.setHash: we must wait', arguments);
				History.pushQueue({
					scope: History,
					callback: History.setHash,
					args: arguments,
					queue: queue
				});
				return false;
			}

			// Log
			//History.debug('History.setHash: called',hash);

			// Make Busy + Continue
			History.busy(true);

			// Check if hash is a state
			State = History.extractState(hash,true);
			if ( State && !History.emulated.pushState ) {
				// Hash is a state so skip the setHash
				//History.debug('History.setHash: Hash is a state so skipping the hash set with a direct pushState call',arguments);

				// PushState
				History.pushState(State.data,State.title,State.url,false);
			}
			else if ( History.getHash() !== hash ) {
				// Hash is a proper hash, so apply it

				// Handle browser bugs
				if ( History.bugs.setHash ) {
					// Fix Safari Bug https://bugs.webkit.org/show_bug.cgi?id=56249

					// Fetch the base page
					pageUrl = History.getPageUrl();

					// Safari hash apply
					History.pushState(null,null,pageUrl+'#'+hash,false);
				}
				else {
					// Normal hash apply
					document.location.hash = hash;
				}
			}

			// Chain
			return History;
		};

		/**
		 * History.escape()
		 * normalize and Escape a Hash
		 * @return {string}
		 */
		History.escapeHash = function(hash){
			// Prepare
			var result = History.normalizeHash(hash);

			// Escape hash
			result = window.encodeURIComponent(result);

			// IE6 Escape Bug
			if ( !History.bugs.hashEscape ) {
				// Restore common parts
				result = result
					.replace(/\%21/g,'!')
					.replace(/\%26/g,'&')
					.replace(/\%3D/g,'=')
					.replace(/\%3F/g,'?');
			}

			// Return result
			return result;
		};

		/**
		 * History.getHashByUrl(url)
		 * Extracts the Hash from a URL
		 * @param {string} url
		 * @return {string} url
		 */
		History.getHashByUrl = function(url){
			// Extract the hash
			var hash = String(url)
				.replace(/([^#]*)#?([^#]*)#?(.*)/, '$2')
				;

			// Unescape hash
			hash = History.unescapeHash(hash);

			// Return hash
			return hash;
		};

		/**
		 * History.setTitle(title)
		 * Applies the title to the document
		 * @param {State} newState
		 * @return {Boolean}
		 */
		History.setTitle = function(newState){
			// Prepare
			var title = newState.title,
				firstState;

			// Initial
			if ( !title ) {
				firstState = History.getStateByIndex(0);
				if ( firstState && firstState.url === newState.url ) {
					title = firstState.title||History.options.initialTitle;
				}
			}

			// Apply
			try {
				document.getElementsByTagName('title')[0].innerHTML = title.replace('<','&lt;').replace('>','&gt;').replace(' & ',' &amp; ');
			}
			catch ( Exception ) { }
			document.title = title;

			// Chain
			return History;
		};


		// ====================================================================
		// Queueing

		/**
		 * History.queues
		 * The list of queues to use
		 * First In, First Out
		 */
		History.queues = [];

		/**
		 * History.busy(value)
		 * @param {boolean} value [optional]
		 * @return {boolean} busy
		 */
		History.busy = function(value){
			// Apply
			if ( typeof value !== 'undefined' ) {
				//History.debug('History.busy: changing ['+(History.busy.flag||false)+'] to ['+(value||false)+']', History.queues.length);
				History.busy.flag = value;
			}
			// Default
			else if ( typeof History.busy.flag === 'undefined' ) {
				History.busy.flag = false;
			}

			// Queue
			if ( !History.busy.flag ) {
				// Execute the next item in the queue
				clearTimeout(History.busy.timeout);
				var fireNext = function(){
					var i, queue, item;
					if ( History.busy.flag ) return;
					for ( i=History.queues.length-1; i >= 0; --i ) {
						queue = History.queues[i];
						if ( queue.length === 0 ) continue;
						item = queue.shift();
						History.fireQueueItem(item);
						History.busy.timeout = setTimeout(fireNext,History.options.busyDelay);
					}
				};
				History.busy.timeout = setTimeout(fireNext,History.options.busyDelay);
			}

			// Return
			return History.busy.flag;
		};

		/**
		 * History.busy.flag
		 */
		History.busy.flag = false;

		/**
		 * History.fireQueueItem(item)
		 * Fire a Queue Item
		 * @param {Object} item
		 * @return {Mixed} result
		 */
		History.fireQueueItem = function(item){
			return item.callback.apply(item.scope||History,item.args||[]);
		};

		/**
		 * History.pushQueue(callback,args)
		 * Add an item to the queue
		 * @param {Object} item [scope,callback,args,queue]
		 */
		History.pushQueue = function(item){
			// Prepare the queue
			History.queues[item.queue||0] = History.queues[item.queue||0]||[];

			// Add to the queue
			History.queues[item.queue||0].push(item);

			// Chain
			return History;
		};

		/**
		 * History.queue (item,queue), (func,queue), (func), (item)
		 * Either firs the item now if not busy, or adds it to the queue
		 */
		History.queue = function(item,queue){
			// Prepare
			if ( typeof item === 'function' ) {
				item = {
					callback: item
				};
			}
			if ( typeof queue !== 'undefined' ) {
				item.queue = queue;
			}

			// Handle
			if ( History.busy() ) {
				History.pushQueue(item);
			} else {
				History.fireQueueItem(item);
			}

			// Chain
			return History;
		};

		/**
		 * History.clearQueue()
		 * Clears the Queue
		 */
		History.clearQueue = function(){
			History.busy.flag = false;
			History.queues = [];
			return History;
		};


		// ====================================================================
		// IE Bug Fix

		/**
		 * History.stateChanged
		 * States whether or not the state has changed since the last double check was initialised
		 */
		History.stateChanged = false;

		/**
		 * History.doubleChecker
		 * Contains the timeout used for the double checks
		 */
		History.doubleChecker = false;

		/**
		 * History.doubleCheckComplete()
		 * Complete a double check
		 * @return {History}
		 */
		History.doubleCheckComplete = function(){
			// Update
			History.stateChanged = true;

			// Clear
			History.doubleCheckClear();

			// Chain
			return History;
		};

		/**
		 * History.doubleCheckClear()
		 * Clear a double check
		 * @return {History}
		 */
		History.doubleCheckClear = function(){
			// Clear
			if ( History.doubleChecker ) {
				clearTimeout(History.doubleChecker);
				History.doubleChecker = false;
			}

			// Chain
			return History;
		};

		/**
		 * History.doubleCheck()
		 * Create a double check
		 * @return {History}
		 */
		History.doubleCheck = function(tryAgain){
			// Reset
			History.stateChanged = false;
			History.doubleCheckClear();

			// Fix IE6,IE7 bug where calling history.back or history.forward does not actually change the hash (whereas doing it manually does)
			// Fix Safari 5 bug where sometimes the state does not change: https://bugs.webkit.org/show_bug.cgi?id=42940
			if ( History.bugs.ieDoubleCheck ) {
				// Apply Check
				History.doubleChecker = setTimeout(
					function(){
						History.doubleCheckClear();
						if ( !History.stateChanged ) {
							//History.debug('History.doubleCheck: State has not yet changed, trying again', arguments);
							// Re-Attempt
							tryAgain();
						}
						return true;
					},
					History.options.doubleCheckInterval
				);
			}

			// Chain
			return History;
		};


		// ====================================================================
		// Safari Bug Fix

		/**
		 * History.safariStatePoll()
		 * Poll the current state
		 * @return {History}
		 */
		History.safariStatePoll = function(){
			// Poll the URL

			// Get the Last State which has the new URL
			var
				urlState = History.extractState(History.getLocationHref()),
				newState;

			// Check for a difference
			if ( !History.isLastSavedState(urlState) ) {
				newState = urlState;
			}
			else {
				return;
			}

			// Check if we have a state with that url
			// If not create it
			if ( !newState ) {
				//History.debug('History.safariStatePoll: new');
				newState = History.createStateObject();
			}

			// Apply the New State
			//History.debug('History.safariStatePoll: trigger');
			History.Adapter.trigger(window,'popstate');

			// Chain
			return History;
		};


		// ====================================================================
		// State Aliases

		/**
		 * History.back(queue)
		 * Send the browser history back one item
		 * @param {Integer} queue [optional]
		 */
		History.back = function(queue){
			//History.debug('History.back: called', arguments);

			// Handle Queueing
			if ( queue !== false && History.busy() ) {
				// Wait + Push to Queue
				//History.debug('History.back: we must wait', arguments);
				History.pushQueue({
					scope: History,
					callback: History.back,
					args: arguments,
					queue: queue
				});
				return false;
			}

			// Make Busy + Continue
			History.busy(true);

			// Fix certain browser bugs that prevent the state from changing
			History.doubleCheck(function(){
				History.back(false);
			});

			// Go back
			history.go(-1);

			// End back closure
			return true;
		};

		/**
		 * History.forward(queue)
		 * Send the browser history forward one item
		 * @param {Integer} queue [optional]
		 */
		History.forward = function(queue){
			//History.debug('History.forward: called', arguments);

			// Handle Queueing
			if ( queue !== false && History.busy() ) {
				// Wait + Push to Queue
				//History.debug('History.forward: we must wait', arguments);
				History.pushQueue({
					scope: History,
					callback: History.forward,
					args: arguments,
					queue: queue
				});
				return false;
			}

			// Make Busy + Continue
			History.busy(true);

			// Fix certain browser bugs that prevent the state from changing
			History.doubleCheck(function(){
				History.forward(false);
			});

			// Go forward
			history.go(1);

			// End forward closure
			return true;
		};

		/**
		 * History.go(index,queue)
		 * Send the browser history back or forward index times
		 * @param {Integer} queue [optional]
		 */
		History.go = function(index,queue){
			//History.debug('History.go: called', arguments);

			// Prepare
			var i;

			// Handle
			if ( index > 0 ) {
				// Forward
				for ( i=1; i<=index; ++i ) {
					History.forward(queue);
				}
			}
			else if ( index < 0 ) {
				// Backward
				for ( i=-1; i>=index; --i ) {
					History.back(queue);
				}
			}
			else {
				throw new Error('History.go: History.go requires a positive or negative integer passed.');
			}

			// Chain
			return History;
		};


		// ====================================================================
		// HTML5 State Support

		// Non-Native pushState Implementation
		if ( History.emulated.pushState ) {
			/*
			 * Provide Skeleton for HTML4 Browsers
			 */

			// Prepare
			var emptyFunction = function(){};
			History.pushState = History.pushState||emptyFunction;
			History.replaceState = History.replaceState||emptyFunction;
		} // History.emulated.pushState

		// Native pushState Implementation
		else {
			/*
			 * Use native HTML5 History API Implementation
			 */

			/**
			 * History.onPopState(event,extra)
			 * Refresh the Current State
			 */
			History.onPopState = function(event,extra){
				// Prepare
				var stateId = false, newState = false, currentHash, currentState;

				// Reset the double check
				History.doubleCheckComplete();

				// Check for a Hash, and handle apporiatly
				currentHash = History.getHash();
				if ( currentHash ) {
					// Expand Hash
					currentState = History.extractState(currentHash||History.getLocationHref(),true);
					if ( currentState ) {
						// We were able to parse it, it must be a State!
						// Let's forward to replaceState
						//History.debug('History.onPopState: state anchor', currentHash, currentState);
						History.replaceState(currentState.data, currentState.title, currentState.url, false);
					}
					else {
						// Traditional Anchor
						//History.debug('History.onPopState: traditional anchor', currentHash);
						History.Adapter.trigger(window,'anchorchange');
						History.busy(false);
					}

					// We don't care for hashes
					History.expectedStateId = false;
					return false;
				}

				// Ensure
				stateId = History.Adapter.extractEventData('state',event,extra) || false;

				// Fetch State
				if ( stateId ) {
					// Vanilla: Back/forward button was used
					newState = History.getStateById(stateId);
				}
				else if ( History.expectedStateId ) {
					// Vanilla: A new state was pushed, and popstate was called manually
					newState = History.getStateById(History.expectedStateId);
				}
				else {
					// Initial State
					newState = History.extractState(History.getLocationHref());
				}

				// The State did not exist in our store
				if ( !newState ) {
					// Regenerate the State
					newState = History.createStateObject(null,null,History.getLocationHref());
				}

				// Clean
				History.expectedStateId = false;

				// Check if we are the same state
				if ( History.isLastSavedState(newState) ) {
					// There has been no change (just the page's hash has finally propagated)
					//History.debug('History.onPopState: no change', newState, History.savedStates);
					History.busy(false);
					return false;
				}

				// Store the State
				History.storeState(newState);
				History.saveState(newState);

				// Force update of the title
				History.setTitle(newState);

				// Fire Our Event
				History.Adapter.trigger(window,'statechange');
				History.busy(false);

				// Return true
				return true;
			};
			History.Adapter.bind(window,'popstate',History.onPopState);

			/**
			 * History.pushState(data,title,url)
			 * Add a new State to the history object, become it, and trigger onpopstate
			 * We have to trigger for HTML4 compatibility
			 * @param {object} data
			 * @param {string} title
			 * @param {string} url
			 * @return {true}
			 */
			History.pushState = function(data,title,url,queue){
				//History.debug('History.pushState: called', arguments);

				// Check the State
				if ( History.getHashByUrl(url) && History.emulated.pushState ) {
					throw new Error('History.js does not support states with fragement-identifiers (hashes/anchors).');
				}

				// Handle Queueing
				if ( queue !== false && History.busy() ) {
					// Wait + Push to Queue
					//History.debug('History.pushState: we must wait', arguments);
					History.pushQueue({
						scope: History,
						callback: History.pushState,
						args: arguments,
						queue: queue
					});
					return false;
				}

				// Make Busy + Continue
				History.busy(true);

				// Create the newState
				var newState = History.createStateObject(data,title,url);

				// Check it
				if ( History.isLastSavedState(newState) ) {
					// Won't be a change
					History.busy(false);
				}
				else {
					// Store the newState
					History.storeState(newState);
					History.expectedStateId = newState.id;

					// Push the newState
					history.pushState(newState.id,newState.title,newState.url);

					// Fire HTML5 Event
					History.Adapter.trigger(window,'popstate');
				}

				// End pushState closure
				return true;
			};

			/**
			 * History.replaceState(data,title,url)
			 * Replace the State and trigger onpopstate
			 * We have to trigger for HTML4 compatibility
			 * @param {object} data
			 * @param {string} title
			 * @param {string} url
			 * @return {true}
			 */
			History.replaceState = function(data,title,url,queue){
				//History.debug('History.replaceState: called', arguments);

				// Check the State
				if ( History.getHashByUrl(url) && History.emulated.pushState ) {
					throw new Error('History.js does not support states with fragement-identifiers (hashes/anchors).');
				}

				// Handle Queueing
				if ( queue !== false && History.busy() ) {
					// Wait + Push to Queue
					//History.debug('History.replaceState: we must wait', arguments);
					History.pushQueue({
						scope: History,
						callback: History.replaceState,
						args: arguments,
						queue: queue
					});
					return false;
				}

				// Make Busy + Continue
				History.busy(true);

				// Create the newState
				var newState = History.createStateObject(data,title,url);

				// Check it
				if ( History.isLastSavedState(newState) ) {
					// Won't be a change
					History.busy(false);
				}
				else {
					// Store the newState
					History.storeState(newState);
					History.expectedStateId = newState.id;

					// Push the newState
					history.replaceState(newState.id,newState.title,newState.url);

					// Fire HTML5 Event
					History.Adapter.trigger(window,'popstate');
				}

				// End replaceState closure
				return true;
			};

		} // !History.emulated.pushState


		// ====================================================================
		// Initialise

		/**
		 * Load the Store
		 */
		if ( sessionStorage ) {
			// Fetch
			try {
				History.store = JSON.parse(sessionStorage.getItem('History.store'))||{};
			}
			catch ( err ) {
				History.store = {};
			}

			// Normalize
			History.normalizeStore();
		}
		else {
			// Default Load
			History.store = {};
			History.normalizeStore();
		}

		/**
		 * Clear Intervals on exit to prevent memory leaks
		 */
		History.Adapter.bind(window,"unload",History.clearAllIntervals);

		/**
		 * Create the initial State
		 */
		History.saveState(History.storeState(History.extractState(History.getLocationHref(),true)));

		/**
		 * Bind for Saving Store
		 */
		if ( sessionStorage ) {
			// When the page is closed
			History.onUnload = function(){
				// Prepare
				var	currentStore, item, currentStoreString;

				// Fetch
				try {
					currentStore = JSON.parse(sessionStorage.getItem('History.store'))||{};
				}
				catch ( err ) {
					currentStore = {};
				}

				// Ensure
				currentStore.idToState = currentStore.idToState || {};
				currentStore.urlToId = currentStore.urlToId || {};
				currentStore.stateToId = currentStore.stateToId || {};

				// Sync
				for ( item in History.idToState ) {
					if ( !History.idToState.hasOwnProperty(item) ) {
						continue;
					}
					currentStore.idToState[item] = History.idToState[item];
				}
				for ( item in History.urlToId ) {
					if ( !History.urlToId.hasOwnProperty(item) ) {
						continue;
					}
					currentStore.urlToId[item] = History.urlToId[item];
				}
				for ( item in History.stateToId ) {
					if ( !History.stateToId.hasOwnProperty(item) ) {
						continue;
					}
					currentStore.stateToId[item] = History.stateToId[item];
				}

				// Update
				History.store = currentStore;
				History.normalizeStore();

				// In Safari, going into Private Browsing mode causes the
				// Session Storage object to still exist but if you try and use
				// or set any property/function of it it throws the exception
				// "QUOTA_EXCEEDED_ERR: DOM Exception 22: An attempt was made to
				// add something to storage that exceeded the quota." infinitely
				// every second.
				currentStoreString = JSON.stringify(currentStore);
				try {
					// Store
					sessionStorage.setItem('History.store', currentStoreString);
				}
				catch (e) {
					if (e.code === DOMException.QUOTA_EXCEEDED_ERR) {
						if (sessionStorage.length) {
							// Workaround for a bug seen on iPads. Sometimes the quota exceeded error comes up and simply
							// removing/resetting the storage can work.
							sessionStorage.removeItem('History.store');
							sessionStorage.setItem('History.store', currentStoreString);
						} else {
							// Otherwise, we're probably private browsing in Safari, so we'll ignore the exception.
						}
					} else {
						throw e;
					}
				}
			};

			// For Internet Explorer
			History.intervalList.push(setInterval(History.onUnload,History.options.storeInterval));

			// For Other Browsers
			History.Adapter.bind(window,'beforeunload',History.onUnload);
			History.Adapter.bind(window,'unload',History.onUnload);

			// Both are enabled for consistency
		}

		// Non-Native pushState Implementation
		if ( !History.emulated.pushState ) {
			// Be aware, the following is only for native pushState implementations
			// If you are wanting to include something for all browsers
			// Then include it above this if block

			/**
			 * Setup Safari Fix
			 */
			if ( History.bugs.safariPoll ) {
				History.intervalList.push(setInterval(History.safariStatePoll, History.options.safariPollInterval));
			}

			/**
			 * Ensure Cross Browser Compatibility
			 */
			if ( navigator.vendor === 'Apple Computer, Inc.' || (navigator.appCodeName||'') === 'Mozilla' ) {
				/**
				 * Fix Safari HashChange Issue
				 */

				// Setup Alias
				History.Adapter.bind(window,'hashchange',function(){
					History.Adapter.trigger(window,'popstate');
				});

				// Initialise Alias
				if ( History.getHash() ) {
					History.Adapter.onDomLoad(function(){
						History.Adapter.trigger(window,'hashchange');
					});
				}
			}

		} // !History.emulated.pushState


	}; // History.initCore

	// Try to Initialise History
	if (!History.options || !History.options.delayInit) {
		History.init();
	}

})(window);

/**
 * History.js jQuery Adapter
 * @author Benjamin Arthur Lupton <contact@balupton.com>
 * @copyright 2010-2011 Benjamin Arthur Lupton <contact@balupton.com>
 * @license New BSD License <http://creativecommons.org/licenses/BSD/>
 */

// Closure
(function(window,undefined){
	"use strict";

	// Localise Globals
	var
		History = window.History = window.History||{},
		jQuery = window.jQuery;

	// Check Existence
	if ( typeof History.Adapter !== 'undefined' ) {
		throw new Error('History.js Adapter has already been loaded...');
	}

	// Add the Adapter
	History.Adapter = {
		/**
		 * History.Adapter.bind(el,event,callback)
		 * @param {Element|string} el
		 * @param {string} event - custom and standard events
		 * @param {function} callback
		 * @return {void}
		 */
		bind: function(el,event,callback){
			jQuery(el).bind(event,callback);
		},

		/**
		 * History.Adapter.trigger(el,event)
		 * @param {Element|string} el
		 * @param {string} event - custom and standard events
		 * @param {Object=} extra - a object of extra event data (optional)
		 * @return {void}
		 */
		trigger: function(el,event,extra){
			jQuery(el).trigger(event,extra);
		},

		/**
		 * History.Adapter.extractEventData(key,event,extra)
		 * @param {string} key - key for the event data to extract
		 * @param {string} event - custom and standard events
		 * @param {Object=} extra - a object of extra event data (optional)
		 * @return {mixed}
		 */
		extractEventData: function(key,event,extra){
			// jQuery Native then jQuery Custom
			var result = (event && event.originalEvent && event.originalEvent[key]) || (extra && extra[key]) || undefined;

			// Return
			return result;
		},

		/**
		 * History.Adapter.onDomLoad(callback)
		 * @param {function} callback
		 * @return {void}
		 */
		onDomLoad: function(callback) {
			jQuery(callback);
		}
	};

	// Try and Initialise History
	if ( typeof History.init !== 'undefined' ) {
		History.init();
	}

})(window);

