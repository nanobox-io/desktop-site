
/* **********************************************
     Begin prism-core.js
********************************************** */

var _self = (typeof window !== 'undefined')
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

var _ = _self.Prism = {
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
					// Check for existence for IE8
					return o.map && o.map(function(v) { return _.util.clone(v); });
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

		// Set language on the element, if not present
		element.className = element.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;

		// Set language on the parent, for styling
		parent = element.parentNode;

		if (/pre/i.test(parent.nodeName)) {
			parent.className = parent.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;
		}

		if (!grammar) {
			return;
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

		if (async && _self.Worker) {
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

if (!_self.document) {
	if (!_self.addEventListener) {
		// in Node.js
		return _self.Prism;
	}
 	// In worker
	_self.addEventListener('message', function(evt) {
		var message = JSON.parse(evt.data),
		    lang = message.language,
		    code = message.code;

		_self.postMessage(JSON.stringify(_.util.encode(_.tokenize(code, _.languages[lang]))));
		_self.close();
	}, false);

	return _self.Prism;
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

return _self.Prism;

})();

if (typeof module !== 'undefined' && module.exports) {
	module.exports = Prism;
}


/* **********************************************
     Begin prism-markup.js
********************************************** */

Prism.languages.markup = {
	'comment': /<!--[\w\W]*?-->/,
	'prolog': /<\?[\w\W]+?\?>/,
	'doctype': /<!DOCTYPE[\w\W]+?>/,
	'cdata': /<!\[CDATA\[[\w\W]*?]]>/i,
	'tag': {
		pattern: /<\/?[^\s>\/]+(?:\s+[^\s>\/=]+(?:=(?:("|')(?:\\\1|\\?(?!\1)[\w\W])*\1|[^\s'">=]+))?)*\s*\/?>/i,
		inside: {
			'tag': {
				pattern: /^<\/?[^\s>\/]+/i,
				inside: {
					'punctuation': /^<\/?/,
					'namespace': /^[^\s>\/:]+:/
				}
			},
			'attr-value': {
				pattern: /=(?:('|")[\w\W]*?(\1)|[^\s>]+)/i,
				inside: {
					'punctuation': /[=>"']/
				}
			},
			'punctuation': /\/?>/,
			'attr-name': {
				pattern: /[^\s>\/]+/,
				inside: {
					'namespace': /^[^\s>\/:]+:/
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
			'rule': /@[\w-]+/
			// See rest below
		}
	},
	'url': /url\((?:(["'])(\\(?:\r\n|[\w\W])|(?!\1)[^\\\r\n])*\1|.*?)\)/i,
	'selector': /[^\{\}\s][^\{\};]*?(?=\s*\{)/,
	'string': /("|')(\\(?:\r\n|[\w\W])|(?!\1)[^\\\r\n])*\1/,
	'property': /(\b|\B)[\w-]+(?=\s*:)/i,
	'important': /\B!important\b/i,
	'function': /[-a-z0-9]+(?=\()/i,
	'punctuation': /[(){};:]/
};

Prism.languages.css['atrule'].inside.rest = Prism.util.clone(Prism.languages.css);

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
			pattern: /(^|[^\\:])\/\/.*/,
			lookbehind: true
		}
	],
	'string': /("|')(\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
	'class-name': {
		pattern: /((?:(?:class|interface|extends|implements|trait|instanceof|new)\s+)|(?:catch\s+\())[a-z0-9_\.\\]+/i,
		lookbehind: true,
		inside: {
			punctuation: /(\.|\\)/
		}
	},
	'keyword': /\b(if|else|while|do|for|return|in|instanceof|function|new|try|throw|catch|finally|null|break|continue)\b/,
	'boolean': /\b(true|false)\b/,
	'function': /[a-z0-9_]+(?=\()/i,
	'number': /\b-?(0x[\dA-Fa-f]+|\d*\.?\d+([Ee]-?\d+)?)\b/,
	'operator': /[-+]{1,2}|!|<=?|>=?|={1,3}|&{1,2}|\|?\||\?|\*|\/|~|\^|%/,
	'punctuation': /[{}[\];(),.:]/
};


/* **********************************************
     Begin prism-javascript.js
********************************************** */

Prism.languages.javascript = Prism.languages.extend('clike', {
	'keyword': /\b(as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|true|try|typeof|var|void|while|with|yield)\b/,
	'number': /\b-?(0x[\dA-Fa-f]+|0b[01]+|0o[0-7]+|\d*\.?\d+([Ee][+-]?\d+)?|NaN|Infinity)\b/,
	'function': /(?!\d)[a-z0-9_$]+(?=\()/i
});

Prism.languages.insertBefore('javascript', 'keyword', {
	'regex': {
		pattern: /(^|[^/])\/(?!\/)(\[.+?]|\\.|[^/\\\r\n])+\/[gimyu]{0,5}(?=\s*($|[\r\n,.;})]))/,
		lookbehind: true
	}
});

Prism.languages.insertBefore('javascript', 'class-name', {
	'template-string': {
		pattern: /`(?:\\`|\\?[^`])*`/,
		inside: {
			'interpolation': {
				pattern: /\$\{[^}]+\}/,
				inside: {
					'interpolation-punctuation': {
						pattern: /^\$\{|\}$/,
						alias: 'punctuation'
					},
					rest: Prism.languages.javascript
				}
			},
			'string': /[\s\S]+/
		}
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

		if(Array.prototype.forEach) { // Check to prevent error in IE8
			Array.prototype.slice.call(document.querySelectorAll('pre[data-src]')).forEach(function (pre) {
				var src = pre.getAttribute('data-src');

				var language, parent = pre;
				var lang = /\blang(?:uage)?-(?!\*)(\w+)\b/i;
				while (parent && !lang.test(parent.className)) {
					parent = parent.parentNode;
				}

				if (parent) {
					language = (pre.className.match(lang) || [, ''])[1];
				}

				if (!language) {
					var extension = (src.match(/\.(\w+)$/) || [, ''])[1];
					language = Extensions[extension] || extension;
				}

				var code = document.createElement('code');
				code.className = 'language-' + language;

				pre.textContent = '';

				code.textContent = 'Loading…';

				pre.appendChild(code);

				var xhr = new XMLHttpRequest();

				xhr.open('GET', src, true);

				xhr.onreadystatechange = function () {
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
		}

	};

	self.Prism.fileHighlight();

})();

Prism.languages.nanobox = {
  // 'comment': /\.*/g
  'command'  : /nanobox|rails/g,
  'prompt'   : /\$|\>/g,
  'parameter': /\sdev\s|\srun\s|\ss\s/g
  // 'comment'  : /\#.+/g,
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

var pxSvgIconString = pxSvgIconString || ''; pxSvgIconString+='<symbol  id="Ruby" viewBox="-32.304 -32.304 64.608 64.608">	<g>		<path class="st0" d="M0,32.304c17.841,0,32.304-14.463,32.304-32.304S17.841-32.304,0-32.304S-32.304-17.841-32.304,0			S-17.841,32.304,0,32.304z"/><polygon class="st1" points="0.01,-9.13 0.01,-20.523 16.742,-8.16 		"/><linearGradient id="SVGID_1_" gradientUnits="userSpaceOnUse" x1="-200.2502" y1="863.3766" x2="-246.795" y2="888.3344" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#EC4A54"/><stop  offset="0.166" style="stop-color:#E84852"/><stop  offset="0.3386" style="stop-color:#DB434B"/><stop  offset="0.5143" style="stop-color:#C73A41"/><stop  offset="0.6919" style="stop-color:#A92E32"/><stop  offset="0.8695" style="stop-color:#841E1F"/><stop  offset="1" style="stop-color:#64100E"/></linearGradient>		<polygon class="st2" points="0.122,-7.854 0.091,-7.857 -17.46,-6.783 0.091,-20.458 0.122,-20.432 		"/><linearGradient id="SVGID_2_" gradientUnits="userSpaceOnUse" x1="-214.1417" y1="839.7227" x2="-225.6673" y2="895.6992" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#EC4A54"/><stop  offset="0.166" style="stop-color:#E84852"/><stop  offset="0.3386" style="stop-color:#DB434B"/><stop  offset="0.5143" style="stop-color:#C73A41"/><stop  offset="0.6919" style="stop-color:#A92E32"/><stop  offset="0.8695" style="stop-color:#841E1F"/><stop  offset="1" style="stop-color:#64100E"/></linearGradient>		<polygon class="st3" points="16.742,-8.16 7.263,3.018 -0.022,-9.134 		"/><polygon class="st4" points="7.263,3.018 15.042,8.117 16.742,-8.16 		"/><linearGradient id="SVGID_3_" gradientUnits="userSpaceOnUse" x1="-191.7189" y1="883.9509" x2="-220.1181" y2="899.1799" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#EC4A54"/><stop  offset="0.166" style="stop-color:#E84852"/><stop  offset="0.3386" style="stop-color:#DB434B"/><stop  offset="0.5143" style="stop-color:#C73A41"/><stop  offset="0.6919" style="stop-color:#A92E32"/><stop  offset="0.8695" style="stop-color:#841E1F"/><stop  offset="1" style="stop-color:#64100E"/></linearGradient>		<polygon class="st5" points="16.742,-8.16 24.763,3.018 15.042,13.219 15.042,8.117 		"/><polygon class="st6" points="-16.786,-8.16 -7.312,3.018 -0.022,-9.134 		"/><polygon class="st4" points="-7.312,3.018 -15.083,8.117 -16.786,-8.16 		"/><polygon class="st4" points="-7.312,3.018 -15.083,8.117 -16.786,-8.16 		"/><linearGradient id="SVGID_4_" gradientUnits="userSpaceOnUse" x1="-250.3905" y1="887.8535" x2="-245.587" y2="896.01" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>		<polygon class="st7" points="-7.312,3.018 -15.083,8.117 -16.786,-8.16 		"/><polygon class="st8" points="-16.786,-7.188 -24.803,3.018 -15.083,13.219 -15.083,8.117 		"/><linearGradient id="SVGID_5_" gradientUnits="userSpaceOnUse" x1="-238.319" y1="903.1234" x2="-252.3954" y2="894.9139" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>		<polygon class="st9" points="-16.786,-7.188 -24.803,3.018 -15.083,13.219 -15.083,8.117 		"/><linearGradient id="SVGID_6_" gradientUnits="userSpaceOnUse" x1="-256.686" y1="892.0714" x2="-234.0124" y2="904.9346" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#61100D"/><stop  offset="0.1734" style="stop-color:#65100F;stop-opacity:0.8266"/><stop  offset="0.3537" style="stop-color:#721115;stop-opacity:0.6463"/><stop  offset="0.537" style="stop-color:#86131F;stop-opacity:0.463"/><stop  offset="0.7226" style="stop-color:#A4162D;stop-opacity:0.2774"/><stop  offset="0.9081" style="stop-color:#C9193F;stop-opacity:0.0919"/><stop  offset="1" style="stop-color:#DE1B49;stop-opacity:0"/></linearGradient>		<polygon class="st10" points="-16.72,-8.109 -24.803,3.018 -15.083,13.219 -15.083,8.117 		"/><linearGradient id="SVGID_7_" gradientUnits="userSpaceOnUse" x1="-237.9497" y1="897.7529" x2="-229.5911" y2="892.241" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#EB3842"/><stop  offset="1" style="stop-color:#AA1F26"/></linearGradient>		<polygon class="st11" points="-0.022,3.018 -7.312,3.018 -7.312,3.018 -0.022,-9.134 7.263,3.018 7.263,3.018 		"/><linearGradient id="SVGID_8_" gradientUnits="userSpaceOnUse" x1="-241.1274" y1="885.8828" x2="-228.9733" y2="898.2568" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0.42"/></linearGradient>		<polygon class="st12" points="-0.022,3.018 -7.312,3.018 -7.312,3.018 -0.022,-9.134 7.263,3.018 7.263,3.018 		"/><polygon class="st13" points="8.358,17.18 -0.022,17.18 -8.406,17.18 -15.083,13.219 -15.083,8.117 -7.312,3.018 -0.022,3.018 			7.263,3.018 15.042,8.117 15.042,13.219 		"/><linearGradient id="SVGID_9_" gradientUnits="userSpaceOnUse" x1="-211.8012" y1="929.3925" x2="-234.1171" y2="902.6561" gradientTransform="matrix(1 0 0 1 232 -894.5)">			<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>		<polygon class="st14" points="8.358,17.18 -0.022,17.18 -8.406,17.18 -15.083,13.219 -15.083,8.117 -7.312,3.018 -0.022,3.018 			7.263,3.018 15.042,8.117 15.042,13.219 		"/></g></symbol><symbol  id="YellowCode" viewBox="-120.858 -64.584 241.716 129.168">	<polygon class="st15" points="120.858,2.281 0,-60.017 -120.858,2.281 0,64.584 	"/><polygon class="st16" points="-67.758,12.41 -91.812,0.025 -96.1,2.285 -72.045,14.668 	"/><polygon class="st16" points="-42.021,17.811 -75.872,0.36 -80.157,2.619 -46.31,20.068 	"/><polygon class="st16" points="-34.375,13.869 -68.225,-3.58 -72.512,-1.324 -38.661,16.127 	"/><polygon class="st16" points="-26.726,9.926 -60.577,-7.524 -64.862,-5.266 -31.016,12.186 	"/><polygon class="st16" points="-32.846,-5.602 -56.899,-17.986 -61.185,-15.73 -37.129,-3.347 	"/><polygon class="st16" points="-7.106,-0.203 -40.959,-17.654 -45.245,-15.395 -11.396,2.056 	"/><polygon class="st16" points="0.539,-4.146 -33.312,-21.596 -37.6,-19.338 -3.75,-1.888 	"/><polygon class="st16" points="8.185,-8.088 -25.663,-25.537 -29.952,-23.281 3.897,-5.83 	"/><polygon class="st16" points="0.858,-22.973 -23.198,-35.356 -27.485,-33.101 -3.43,-20.716 	"/><polygon class="st16" points="26.597,-17.574 -7.256,-35.024 -11.545,-32.766 22.308,-15.315 	"/><polygon class="st16" points="34.242,-21.518 0.392,-38.967 -3.897,-36.707 29.955,-19.261 	"/><polygon class="st16" points="41.89,-25.457 8.035,-42.908 3.748,-40.651 37.601,-23.201 	"/><polygon class="st16" points="-13.715,40 -37.769,27.615 -42.059,29.873 -18.004,42.26 	"/><polygon class="st16" points="12.021,45.4 -21.829,27.95 -26.114,30.211 7.733,47.659 	"/><polygon class="st16" points="19.666,41.461 -14.182,24.01 -18.469,26.268 15.382,43.717 	"/><polygon class="st16" points="27.315,37.52 -6.536,20.066 -10.823,22.325 23.027,39.776 	"/><polygon class="st16" points="21.199,21.988 -2.854,9.604 -7.144,11.862 16.91,24.246 	"/><polygon class="st16" points="46.935,27.388 13.084,9.937 8.796,12.195 42.647,29.646 	"/><polygon class="st16" points="54.58,23.445 20.731,5.996 16.441,8.254 50.294,25.703 	"/><polygon class="st16" points="62.228,19.502 28.378,2.056 24.091,4.313 57.94,21.763 	"/><polygon class="st16" points="54.899,4.617 30.847,-7.768 26.56,-5.512 50.615,6.873 	"/><polygon class="st16" points="80.636,10.016 46.785,-7.435 42.498,-5.176 76.349,12.274 	"/><polygon class="st16" points="88.283,6.074 54.433,-11.375 50.146,-9.117 83.994,8.332 	"/><polygon class="st16" points="95.931,2.131 62.078,-15.315 57.791,-13.059 91.642,4.392 	"/><polygon class="st17" points="0,-60.017 120.858,2.281 120.858,-2.287 0,-64.584 	"/><polygon class="st18" points="0,-60.017 -120.858,2.281 -120.858,-2.287 0,-64.584 	"/></symbol><symbol  id="mini-stack_1_" viewBox="-43.885 -74.551 87.77 149.102">	<polygon class="st19" points="43.885,-45.754 0.515,-68.109 -43.885,-45.354 -0.518,-23 	"/><polygon class="st20" points="6.629,-50.784 -8.676,-58.825 -16.331,-54.878 -1.026,-46.842 	"/><polygon class="st21" points="-16.331,-54.83 -1.026,-46.791 -1.026,-52.094 -11.283,-57.48 	"/><polyline class="st22" points="-1.026,-46.791 -1.026,-52.094 1.562,-53.445 6.629,-50.784 	"/><polygon class="st20" points="-3.083,-45.751 -18.387,-53.791 -26.041,-49.846 -10.735,-41.809 	"/><polygon class="st21" points="-26.041,-49.795 -10.735,-41.757 -10.735,-47.061 -20.995,-52.446 	"/><polyline class="st22" points="-10.735,-41.757 -10.735,-47.061 -8.148,-48.411 -3.083,-45.751 	"/><polygon class="st20" points="-12.794,-40.666 -28.098,-48.707 -35.751,-44.761 -20.446,-36.725 	"/><polygon class="st21" points="-35.751,-44.712 -20.446,-36.674 -20.446,-41.976 -30.706,-47.362 	"/><polyline class="st22" points="-20.446,-36.674 -20.446,-41.976 -17.859,-43.327 -12.794,-40.666 	"/><polygon class="st22" points="0.515,-68.168 43.885,-45.814 43.885,-52.196 0.515,-74.551 	"/><polygon class="st21" points="0.515,-68.168 -43.885,-45.354 -43.885,-51.737 0.515,-74.551 	"/><polygon class="st20" points="31.076,-48.091 10.903,-58.582 3.252,-54.636 23.425,-44.147 	"/><polygon class="st21" points="3.254,-54.634 28.485,-41.442 28.485,-46.745 8.345,-57.267 	"/><polygon class="st20" points="26.458,-40.37 11.154,-48.41 3.501,-44.464 18.807,-36.426 	"/><polygon class="st21" points="3.501,-44.412 18.807,-36.378 18.807,-41.678 8.547,-47.063 	"/><polyline class="st22" points="18.807,-36.378 18.807,-41.678 21.393,-43.029 26.458,-40.37 	"/><polygon class="st20" points="16.745,-35.336 1.443,-43.376 -6.212,-39.429 9.094,-31.395 	"/><polygon class="st21" points="-6.212,-39.378 9.094,-31.343 9.094,-36.646 -1.165,-42.031 	"/><polyline class="st22" points="9.094,-31.343 9.094,-36.646 11.682,-37.998 16.745,-35.336 	"/><polygon class="st20" points="7.036,-30.253 -8.267,-38.291 -15.923,-34.346 -0.615,-26.31 	"/><polygon class="st21" points="-15.923,-34.295 -0.615,-26.26 -0.615,-31.56 -10.875,-36.948 	"/><polyline class="st22" points="-0.615,-26.26 -0.615,-31.56 1.972,-32.913 7.036,-30.253 	"/><polyline class="st22" points="28.477,-41.438 28.477,-46.74 31.065,-48.092 36.127,-45.432 	"/><polygon class="st20" points="8.543,-59.718 0.547,-63.955 -7.107,-60.009 0.892,-55.774 	"/><polygon class="st21" points="-7.107,-59.959 0.892,-55.725 0.892,-61.026 -2.061,-62.61 	"/><polyline class="st22" points="0.892,-55.725 0.892,-61.026 3.482,-62.379 8.543,-59.718 	"/><polygon class="st23" points="31.031,-39.259 -0.514,-55.52 -32.06,-39.259 -0.514,-23 	"/><polygon class="st24" points="0.961,-32.003 36.321,-13.776 36.321,-19.094 0.961,-37.319 	"/><polygon class="st25" points="0.961,-32.003 -34.401,-13.776 -34.401,-19.094 0.961,-37.319 	"/><polygon class="st26" points="36.321,-13.776 0.961,-32.003 -34.401,-13.776 0.961,4.449 	"/><polygon class="st27" points="26.995,-8.992 0.961,-22.412 -25.073,-8.992 0.961,4.427 	"/><polygon class="st28" points="0.961,-3.666 43.806,18.416 43.806,11.974 0.961,-10.109 	"/><polygon class="st29" points="0.961,-3.666 -41.885,18.416 -41.885,11.974 0.961,-10.109 	"/><polygon class="st30" points="43.806,18.416 0.961,-3.666 -41.885,18.416 0.961,40.5 	"/><polygon class="st31" points="32.506,24.213 0.961,7.953 -30.583,24.213 0.961,40.473 	"/><polygon class="st15" points="43.798,52.316 0.665,30.084 -42.47,52.316 0.665,74.551 	"/><polygon class="st17" points="0.665,30.084 43.798,52.316 43.798,45.831 0.665,23.599 	"/><polygon class="st18" points="0.665,30.084 -42.47,52.316 -42.47,45.831 0.665,23.599 	"/></symbol><symbol  id="scientist" viewBox="-91.491 -70.827 182.983 141.655">	<path class="st32" d="M-41.396,29.823c-28.338-10.293-48.997-48.933-48.997-83.58l-0.099-14.688"/><path class="st32" d="M25.57,0.218c-3.459,5.248-7.594,8.271-10.109,7.021c-0.773-0.383-1.321-1.129-1.651-2.146"/><path class="st32" d="M24.086-18.969c1.834-1.33,3.553-1.812,4.848-1.188c2.041,1.02,2.519,4.561,1.541,9.021"/><path class="st32" d="M-40.225-1.007"/><line class="st32" x1="15.229" y1="7.132" x2="56.802" y2="30.83"/><line class="st32" x1="53.889" y1="-6.638" x2="68.896" y2="-68.749"/><path class="st32" d="M12.76-9.384c-0.169-0.213-0.328-0.438-0.477-0.674c-1.479-2.363-1.807-5.812,0.188-8.207"/><path class="st32" d="M6.189-23.472C1.669-18.014,1.863-9.628,6.648-3.966L6.95-3.654L17.673,3.94"/><path class="st32" d="M9.333-20.868c-2.341,2.814-2.831,6.562-1.876,9.896"/><path class="st32" d="M16.536-29.067c-0.202,0.477-0.293,0.979-0.237,1.521c0.071,0.725,0.362,1.377,0.854,1.828		c0.854,0.771,3.271,2.688,3.271,2.688"/><path class="st33" d="M-18.861-69.827c-1.38,0-2.451,0.939-1.228,2.836c2.127,3.271,9.295,17.438,9.979,18.332		c1.153,1.496,1.137,2.541,0.188,2.541c-0.942,0,0,0-1.894,0c-1.891,0-1.699,2.646,0,2.646c1.57,0,11.148,0,12.854,0		s1.895-2.646,0-2.646c-1.891,0-0.941,0-1.891,0c-0.943,0-0.504-1.492,0.188-2.541c0.623-0.949,7.857-15.062,9.984-18.332		c1.229-1.896,0.149-2.836-1.229-2.836C6.113-69.827-16.873-69.827-18.861-69.827z"/><line class="st34" x1="-12.328" y1="-59.239" x2="-15.882" y2="-65.99"/><line class="st34" x1="-8.089" y1="-57.562" x2="-12.527" y2="-65.99"/><line class="st34" x1="-5.521" y1="-59.047" x2="-9.178" y2="-65.99"/><line class="st34" x1="-1.387" y1="-57.562" x2="-5.824" y2="-65.99"/><line class="st34" x1="1.093" y1="-59.227" x2="-2.471" y2="-65.99"/><line class="st34" x1="3.006" y1="-61.96" x2="0.883" y2="-65.99"/><line class="st34" x1="5.104" y1="-64.354" x2="4.236" y2="-65.99"/><path class="st33" d="M-1.783-24.651c-0.05-0.771,0.549-1.463,1.333-1.52c0.46-0.021,0.882,0.162,1.164,0.484l2.084,1.812"/><path class="st34" d="M-6.076-40c0.965,3.719,2.645,7.166,4.938,10.195"/><path class="st34" d="M-2.915-40.819c1.271,4.92,4.604,10.619,8.261,13.938l3.6,3.041"/><path class="st32" d="M-36.874-68.439l-7.521,46.869c-18-4-20.666-46.869-20.666-46.869"/><line class="st32" x1="33.348" y1="-61.297" x2="53.031" y2="-55.565"/><line class="st32" x1="34.188" y1="-48.465" x2="36.256" y2="-56.992"/><line class="st32" x1="36.917" y1="-47.568" x2="38.984" y2="-56.097"/><polyline class="st32" points="45.396,-49.376 45.548,-50.001 46.611,-54.387 	"/><path class="st32" d="M10.838,38.883c1.264,0.062,58.369,5.922,65.25,5.922c7.953,0,14.403-6.354,14.403-14.213		c0-4.547-2.165-8.604-5.531-11.199l-55.587-39.26"/><path class="st33" d="M6.582-33.588C5.797-33.68,5.09-33.109,5-32.335c-0.054,0.457,0.117,0.895,0.421,1.188l0.003-0.002		l28.76,25.951c0.694,0.66,1.131,1.592,1.131,2.627c0,1.998-1.621,3.619-3.621,3.619c-0.842,0-1.613-0.287-2.228-0.771		l-15.71-14.229"/><path class="st32" d="M-18.605,32.32"/><line class="st34" x1="-17.771" y1="-23.472" x2="-10.604" y2="-36.762"/><line class="st34" x1="-14.979" y1="-40" x2="-20.562" y2="-33.597"/><line class="st34" x1="-17.668" y1="-43.236" x2="-27.566" y2="-38.731"/><line class="st34" x1="-18.669" y1="-47.297" x2="-25.323" y2="-47.297"/><path class="st35" d="M-33.736,59.88c0.401-5.266,8.303-9.723,17.442-8.244c4.062,0.646,6.131,2.562,11.455,2.996"/><path class="st35" d="M-30.773,63.334c2.977-2.932,8.971-5.639,15.383-4.146"/><path class="st36" d="M-22.689,29.495"/><path class="st32" d="M-7.979,38.991c2.258,0,4.088-1.83,4.088-4.088c0-2.27-1.83-4.088-4.088-4.088s-4.088,1.818-4.088,4.088		C-12.066,37.16-10.236,38.991-7.979,38.991z"/><path class="st32" d="M-26.788,36.101c2.259,0,4.088-1.816,4.088-4.088c0-2.258-1.829-4.088-4.088-4.088		c-2.258,0-4.088,1.83-4.088,4.088C-30.875,34.271-29.043,36.101-26.788,36.101z"/><path class="st35" d="M-1.484,21.153c0-1.867,1.512-3.379,3.377-3.379s3.379,1.512,3.379,3.379"/><path class="st32" d="M-30.396,19.094c-1.865,0-3.377,1.521-3.377,3.377V29.2"/><path class="st35" d="M-2.146,16.997c-1.865,0-3.379-1.514-3.379-3.379c0-1.857,1.514-3.377,3.379-3.377"/><path class="st35" d="M-1.266,6.731c1.865,0,3.377,1.514,3.377,3.379c0,1.854-1.512,3.377-3.377,3.377"/><path class="st35" d="M-4.909,2.63c-1.866,0-3.378-1.52-3.378-3.385c0-1.857,1.512-3.377,3.378-3.377"/><path class="st35" d="M-17.736,3.636c-1.865,0-3.378-1.52-3.378-3.379c0-1.865,1.513-3.377,3.378-3.377"/><path class="st35" d="M-10.626-3.263c0-1.865-1.513-3.377-3.378-3.377"/><path class="st35" d="M-25.227,2.054c1.865,0,3.377,1.521,3.377,3.377"/><path class="st35" d="M-30.762,12.519c1.865,0,3.384,1.521,3.384,3.391c0,1.854-1.517,3.379-3.384,3.379"/><path class="st35" d="M-27.275,9.606c0-1.865,1.514-3.389,3.379-3.389"/><path class="st35" d="M-15.229,2.106c-1.865,0-3.379,1.514-3.379,3.379V9.09"/><path class="st35" d="M-15.521-1.591c1.867,0,3.379,1.52,3.379,3.377V7.52"/><path class="st35" d="M-11.471,4.343c1.865,0,3.379,1.521,3.379,3.377v5.729"/><path class="st35" d="M-2.15-0.833c-1.865,0-3.377,1.521-3.377,3.385v5.729"/><line class="st32" x1="-19.021" y1="13.126" x2="-10.27" y2="14.465"/><path class="st35" d="M-22.917,11.394l-0.415,3.602c-0.214,1.854,1.111,3.521,2.968,3.73l3.175,0.367"/><path class="st35" d="M-8.061,12.968l-0.229,3.604c-0.121,1.854-1.729,3.271-3.594,3.146l-3.188-0.209"/><path class="st32" d="M-3.837,36.101c3.637,0,9.265,3.396,9.265,13.205"/><path class="st32" d="M-22.7,32.013c0,0,4.509,5.062,10.632,2.229"/><path class="st32" d="M-30.875,32.013c-4.651,0.354-4.938,2.855-4.938,5.688c0,4.219-1.207,7.979-1.207,10.908		c0,11.719,9.502,21.219,21.227,21.219c11.72,0,21.222-9.5,21.222-21.219c0-2.336-0.032-4.906-0.157-7.578c0,0,0-16.746,0-19.875"/><path class="st32" d="M-0.688,64.023"/><path class="st36" d="M-10.594,35.382c0.062,0.873,0.82,1.521,1.693,1.461"/><path class="st36" d="M-29.688,32.448c0.068,0.873,0.828,1.521,1.699,1.459"/><path class="st35" d="M-25.596,67.574c4.396-3.875,9.232-0.688,14.729-4.004"/></symbol><g id="engine-sniff" data-size="458x184" class="nanobox-svg ">			<use xlink:href="#YellowCode"  width="241.716" height="129.168" x="-120.858" y="-64.584" transform="matrix(0.9087 0 0 -0.9087 109.8237 87.5096)" style="overflow:visible;"/><circle class="st37" cx="301.208" cy="18.907" r="18.907"/><polygon class="st38" points="301.548,5.354 313.696,12.315 313.696,26.238 301.548,33.201 289.399,26.238 289.399,12.315 	"/><path class="st37" d="M309.334,14.93c0-0.312-0.162-0.593-0.427-0.74l-7.104-4.25c-0.104-0.07-0.254-0.283-0.39-0.283		c-0.013,0-0.062,0-0.073,0c-0.136,0-0.269,0.213-0.392,0.283l-7.089,4.166c-0.271,0.147-0.438,0.478-0.438,0.786l0.021,11.008		c0,0.147,0.074,0.305,0.214,0.38c0.132,0.078,0.294,0.084,0.426,0.006l4.245-2.409c0.271-0.146,0.462-0.437,0.462-0.729v-5.146		c0-0.306,0.13-0.59,0.396-0.729l1.771-1.034c0.139-0.077,0.271-0.114,0.421-0.114c0.146,0,0.292,0.037,0.427,0.114l1.92,1.034		c0.271,0.146,0.562,0.436,0.562,0.729v5.146c0,0.306,0.037,0.586,0.301,0.729l4.149,2.413c0.133,0.079,0.267,0.079,0.396,0		c0.13-0.062,0.195-0.217,0.195-0.354L309.334,14.93L309.334,14.93z"/><circle class="st38" cx="301.004" cy="67.405" r="18.907"/><polygon class="st39" points="301.58,58.675 295.275,58.675 295.275,56.037 298.082,53.07 305.641,53.07 308.586,56.144 		308.586,63.594 305.826,66.382 297.041,66.382 293.873,69.578 293.873,73.597 291.038,73.236 288.267,70.588 288.267,63.29 		291.479,60.076 301.58,60.076 	"/><rect x="298.534" y="55.047" transform="matrix(0.7078 -0.7064 0.7064 0.7078 47.9971 227.8099)" class="st38" width="1.681" height="1.679"/><polygon class="st40" points="302.281,75.49 308.586,75.49 308.586,77.925 305.909,80.394 298.348,80.394 295.275,77.817 		295.275,70.367 298.164,67.783 306.951,67.783 309.987,64.716 309.987,60.629 312.99,60.724 315.592,63.373 315.592,70.67 		312.51,74.089 302.281,74.089 	"/><rect x="304.283" y="77.146" transform="matrix(0.7073 -0.707 0.707 0.7073 34.1903 238.5377)" class="st38" width="1.677" height="1.677"/><circle class="st41" cx="300.834" cy="113.692" r="18.907"/><g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<g>																										<defs>																											<circle id="SVGID_10_" cx="300.834" cy="113.692" r="18.907"/></defs>																										<clipPath id="SVGID_11_">																											<use xlink:href="#SVGID_10_"  style="overflow:visible;"/></clipPath>																										<path class="st42" d="M305.725,116.991l5.979,13.658c0,0,10.771-3.912,10.771-13.56																											c0-4.521-2.605-11.021-2.605-11.021l-10.436-0.396"/></g>																								</g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<g>																										<defs>																											<circle id="SVGID_12_" cx="300.834" cy="113.692" r="18.907"/></defs>																										<clipPath id="SVGID_13_">																											<use xlink:href="#SVGID_12_"  style="overflow:visible;"/></clipPath>																										<path class="st43" d="M306.577,118.358l-6.127,15.372c0,0,8.59,0.259,11.312-1.929																											c2.271-1.812,0.107-9.604,0.107-9.604L306.577,118.358z"/></g>																								</g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<g>																										<defs>																											<circle id="SVGID_14_" cx="300.834" cy="113.692" r="18.907"/></defs>																										<clipPath id="SVGID_15_">																											<use xlink:href="#SVGID_14_"  style="overflow:visible;"/></clipPath>																										<polygon class="st44" points="311.135,107.443 315.081,113.188 308.833,123.928 306.577,118.894 																																																					"/></g>																								</g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<g>																										<defs>																											<circle id="SVGID_16_" cx="300.834" cy="113.692" r="18.907"/></defs>																										<clipPath id="SVGID_17_">																											<use xlink:href="#SVGID_16_"  style="overflow:visible;"/></clipPath>																										<polygon class="st45" points="298.221,106.382 301.598,103.415 304.895,103.909 309.096,103.415 																											314.014,113.129 308.979,120.151 303.813,117.77 304.565,113.218 303.815,116.961 301.962,116.839 																											300.462,118.432 299.411,118.26 299.311,117.12 298.221,117.667 296.987,122.792 292.29,123.928 																											289.489,120.17 291.131,119.401 293.526,121.456 295.338,120.17 294.35,113.667 																																																					"/></g>																								</g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<g>																										<defs>																											<circle id="SVGID_18_" cx="300.834" cy="113.692" r="18.907"/></defs>																										<clipPath id="SVGID_19_">																											<use xlink:href="#SVGID_18_"  style="overflow:visible;"/></clipPath>																										<polygon class="st46" points="299.616,113.364 300.364,114.701 297.919,115.257 292.45,111.055 																											293.258,110.643 297.907,113.67 																										"/></g>																								</g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<g>																										<defs>																											<circle id="SVGID_20_" cx="300.834" cy="113.692" r="18.907"/></defs>																										<clipPath id="SVGID_21_">																											<use xlink:href="#SVGID_20_"  style="overflow:visible;"/></clipPath>																										<polygon class="st47" points="293.669,114.329 292.02,114.329 289.301,112.068 288.725,112.504 																											291.608,115.264 293.999,115.527 																										"/></g>																								</g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<g>																										<defs>																											<circle id="SVGID_22_" cx="300.834" cy="113.692" r="18.907"/></defs>																										<clipPath id="SVGID_23_">																											<use xlink:href="#SVGID_22_"  style="overflow:visible;"/></clipPath>																										<circle class="st48" cx="301.579" cy="109.753" r="1.068"/></g>																								</g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<g>												<g>													<g>														<g>															<g>																<g>																	<g>																		<g>																			<g>																				<g>																					<g>																						<g>																							<g>																								<g>																									<g>																										<defs>																											<circle id="SVGID_24_" cx="300.834" cy="113.692" r="18.907"/></defs>																										<clipPath id="SVGID_25_">																											<use xlink:href="#SVGID_24_"  style="overflow:visible;"/></clipPath>																										<polygon class="st49" points="305.725,108.196 303.942,116.991 302.29,116.886 																																																					"/></g>																								</g>																							</g>																						</g>																					</g>																				</g>																			</g>																		</g>																	</g>																</g>															</g>														</g>													</g>												</g>											</g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<g class="st50">		<path class="st51" d="M335.565,21.809v-7.598h0.795c0.19,0,0.31,0.093,0.36,0.277l0.105,0.825c0.33-0.365,0.699-0.66,1.106-0.885			c0.407-0.226,0.878-0.338,1.414-0.338c0.415,0,0.781,0.069,1.099,0.206c0.317,0.138,0.583,0.333,0.795,0.586			c0.213,0.252,0.374,0.556,0.484,0.911c0.11,0.354,0.165,0.747,0.165,1.177v4.838h-1.335v-4.838c0-0.574-0.131-1.021-0.394-1.338			c-0.263-0.318-0.664-0.477-1.204-0.477c-0.395,0-0.764,0.095-1.106,0.285c-0.343,0.189-0.659,0.447-0.949,0.772v5.595H335.565z"/><path class="st51" d="M346.979,14.092c0.555,0,1.056,0.093,1.504,0.277c0.447,0.186,0.827,0.448,1.14,0.788			c0.312,0.34,0.552,0.751,0.72,1.233s0.251,1.021,0.251,1.616c0,0.601-0.084,1.141-0.251,1.62c-0.167,0.48-0.408,0.891-0.72,1.23			c-0.313,0.34-0.693,0.601-1.14,0.783c-0.448,0.183-0.949,0.274-1.504,0.274c-0.555,0-1.056-0.092-1.504-0.274			c-0.447-0.183-0.829-0.443-1.144-0.783s-0.558-0.75-0.728-1.23c-0.17-0.479-0.255-1.02-0.255-1.62			c0-0.595,0.085-1.134,0.255-1.616s0.413-0.894,0.728-1.233s0.696-0.603,1.144-0.788C345.923,14.184,346.425,14.092,346.979,14.092			z M346.979,20.872c0.75,0,1.31-0.251,1.68-0.754c0.37-0.502,0.555-1.203,0.555-2.104c0-0.905-0.185-1.61-0.555-2.115			c-0.37-0.505-0.93-0.758-1.68-0.758c-0.38,0-0.71,0.065-0.99,0.195c-0.28,0.13-0.514,0.317-0.702,0.562s-0.327,0.547-0.42,0.904			c-0.092,0.357-0.139,0.761-0.139,1.211s0.046,0.853,0.139,1.207c0.093,0.355,0.232,0.654,0.42,0.896			c0.188,0.243,0.421,0.429,0.702,0.559C346.269,20.807,346.6,20.872,346.979,20.872z"/><path class="st51" d="M357.592,21.809c-0.19,0-0.31-0.093-0.36-0.277l-0.12-0.923c-0.325,0.396-0.696,0.712-1.114,0.949			s-0.896,0.356-1.436,0.356c-0.435,0-0.83-0.084-1.185-0.252c-0.355-0.167-0.658-0.413-0.908-0.738s-0.442-0.73-0.577-1.215			c-0.135-0.485-0.203-1.043-0.203-1.673c0-0.56,0.075-1.081,0.225-1.563s0.366-0.901,0.648-1.257			c0.283-0.354,0.626-0.634,1.031-0.836c0.405-0.202,0.865-0.304,1.38-0.304c0.465,0,0.862,0.079,1.192,0.236			s0.625,0.379,0.885,0.664v-4.216h1.335v11.048H357.592z M355.005,20.835c0.435,0,0.816-0.101,1.144-0.301			c0.328-0.199,0.629-0.482,0.904-0.847v-3.676c-0.245-0.33-0.514-0.561-0.806-0.693s-0.616-0.199-0.971-0.199			c-0.71,0-1.255,0.253-1.635,0.758c-0.38,0.505-0.57,1.226-0.57,2.16c0,0.495,0.042,0.919,0.127,1.271s0.21,0.643,0.375,0.87			s0.368,0.394,0.607,0.498C354.42,20.782,354.695,20.835,355.005,20.835z"/><path class="st51" d="M363.637,14.092c0.455,0,0.875,0.076,1.26,0.229c0.385,0.152,0.718,0.372,0.998,0.659			c0.28,0.288,0.499,0.643,0.656,1.065c0.158,0.423,0.236,0.903,0.236,1.443c0,0.21-0.022,0.351-0.067,0.42			c-0.045,0.07-0.13,0.105-0.255,0.105h-5.055c0.01,0.479,0.075,0.897,0.195,1.252c0.12,0.355,0.285,0.651,0.495,0.89			c0.21,0.237,0.46,0.415,0.75,0.532s0.615,0.176,0.975,0.176c0.335,0,0.624-0.038,0.866-0.116c0.243-0.077,0.451-0.161,0.626-0.251			c0.175-0.09,0.321-0.174,0.438-0.251c0.118-0.078,0.219-0.116,0.304-0.116c0.11,0,0.195,0.042,0.255,0.127l0.375,0.487			c-0.165,0.2-0.362,0.374-0.592,0.521s-0.476,0.269-0.739,0.364c-0.263,0.095-0.534,0.166-0.814,0.214			c-0.28,0.047-0.557,0.071-0.832,0.071c-0.525,0-1.009-0.089-1.452-0.267c-0.442-0.178-0.825-0.438-1.147-0.78			c-0.322-0.342-0.574-0.766-0.753-1.271c-0.18-0.505-0.27-1.085-0.27-1.739c0-0.53,0.081-1.025,0.244-1.485			c0.162-0.46,0.396-0.858,0.701-1.196c0.305-0.338,0.677-0.603,1.118-0.795C362.592,14.188,363.087,14.092,363.637,14.092z			 M363.667,15.074c-0.645,0-1.152,0.187-1.522,0.56c-0.37,0.372-0.6,0.889-0.69,1.548h4.133c0-0.31-0.043-0.593-0.128-0.851			s-0.21-0.48-0.375-0.668s-0.366-0.332-0.604-0.435C364.243,15.126,363.972,15.074,363.667,15.074z"/><path class="st51" d="M368.055,20.984c0-0.13,0.023-0.252,0.071-0.367c0.047-0.115,0.112-0.215,0.195-0.3s0.181-0.152,0.296-0.203			c0.115-0.05,0.237-0.074,0.367-0.074s0.252,0.024,0.368,0.074c0.115,0.051,0.215,0.118,0.3,0.203s0.151,0.185,0.199,0.3			c0.048,0.115,0.071,0.237,0.071,0.367c0,0.135-0.023,0.259-0.071,0.371c-0.047,0.113-0.114,0.212-0.199,0.297			s-0.185,0.151-0.3,0.198c-0.115,0.048-0.238,0.071-0.368,0.071s-0.252-0.023-0.367-0.071c-0.115-0.047-0.214-0.113-0.296-0.198			s-0.147-0.184-0.195-0.297C368.078,21.243,368.055,21.119,368.055,20.984z"/><path class="st51" d="M373.154,14.211v8.161c0,0.305-0.04,0.589-0.12,0.852c-0.08,0.262-0.206,0.491-0.379,0.686			c-0.172,0.195-0.395,0.35-0.667,0.462s-0.599,0.169-0.979,0.169c-0.165,0-0.315-0.013-0.45-0.038			c-0.135-0.025-0.27-0.062-0.405-0.112l0.06-0.72c0.01-0.065,0.032-0.106,0.067-0.124s0.09-0.026,0.165-0.026			c0.04,0,0.083,0,0.127,0s0.1,0,0.165,0c0.39,0,0.667-0.091,0.833-0.273s0.248-0.476,0.248-0.881v-8.154H373.154z M373.454,11.827			c0,0.13-0.026,0.251-0.079,0.363c-0.053,0.113-0.123,0.213-0.21,0.301c-0.087,0.087-0.189,0.156-0.304,0.206			c-0.115,0.05-0.238,0.075-0.368,0.075s-0.251-0.025-0.364-0.075c-0.112-0.05-0.212-0.119-0.3-0.206			c-0.087-0.088-0.156-0.188-0.207-0.301c-0.05-0.112-0.075-0.233-0.075-0.363s0.025-0.254,0.075-0.371			c0.05-0.117,0.119-0.22,0.207-0.308s0.188-0.156,0.3-0.206c0.113-0.05,0.234-0.075,0.364-0.075s0.252,0.025,0.368,0.075			c0.115,0.05,0.216,0.118,0.304,0.206s0.157,0.19,0.21,0.308C373.428,11.573,373.454,11.697,373.454,11.827z"/><path class="st51" d="M379.829,15.465c-0.06,0.109-0.152,0.165-0.277,0.165c-0.075,0-0.16-0.027-0.255-0.083			c-0.095-0.055-0.211-0.116-0.349-0.184c-0.138-0.067-0.301-0.13-0.492-0.188c-0.19-0.058-0.415-0.086-0.675-0.086			c-0.225,0-0.427,0.028-0.607,0.086s-0.334,0.137-0.461,0.236s-0.225,0.216-0.292,0.349s-0.101,0.276-0.101,0.432			c0,0.194,0.056,0.357,0.168,0.487c0.113,0.13,0.261,0.242,0.446,0.337c0.185,0.096,0.395,0.18,0.63,0.252			c0.235,0.072,0.476,0.149,0.724,0.232c0.248,0.082,0.489,0.174,0.724,0.273c0.235,0.101,0.445,0.226,0.63,0.375			c0.185,0.15,0.334,0.334,0.446,0.552c0.113,0.217,0.169,0.479,0.169,0.783c0,0.351-0.062,0.674-0.188,0.972			c-0.125,0.297-0.31,0.555-0.555,0.772s-0.545,0.389-0.9,0.514s-0.765,0.188-1.23,0.188c-0.53,0-1.01-0.086-1.44-0.259			c-0.43-0.173-0.795-0.394-1.095-0.664l0.315-0.51c0.04-0.064,0.087-0.115,0.143-0.15c0.055-0.034,0.127-0.052,0.218-0.052			c0.09,0,0.185,0.035,0.285,0.104c0.1,0.07,0.222,0.147,0.364,0.232c0.143,0.085,0.315,0.163,0.518,0.232			c0.203,0.07,0.457,0.105,0.761,0.105c0.26,0,0.488-0.034,0.683-0.102s0.357-0.158,0.487-0.273c0.13-0.115,0.227-0.248,0.289-0.397			c0.062-0.15,0.094-0.311,0.094-0.48c0-0.21-0.056-0.384-0.169-0.521c-0.112-0.138-0.261-0.256-0.446-0.353			c-0.185-0.098-0.396-0.183-0.634-0.256c-0.237-0.072-0.48-0.148-0.728-0.229c-0.247-0.08-0.49-0.171-0.728-0.273			c-0.237-0.103-0.449-0.231-0.633-0.387c-0.185-0.154-0.334-0.346-0.446-0.573c-0.113-0.228-0.169-0.504-0.169-0.829			c0-0.29,0.06-0.568,0.18-0.836c0.12-0.268,0.295-0.503,0.525-0.705s0.512-0.364,0.848-0.483c0.334-0.12,0.717-0.181,1.147-0.181			c0.5,0,0.949,0.079,1.346,0.236s0.741,0.374,1.031,0.649L379.829,15.465z"/></g>	<g class="st50">		<path class="st51" d="M335.565,73.382v-10.17h0.795c0.19,0,0.31,0.093,0.36,0.277l0.112,0.9c0.325-0.395,0.696-0.713,1.114-0.952			c0.417-0.24,0.899-0.36,1.444-0.36c0.435,0,0.83,0.084,1.185,0.251c0.355,0.168,0.657,0.415,0.908,0.743			c0.25,0.327,0.442,0.733,0.577,1.219c0.135,0.484,0.203,1.042,0.203,1.672c0,0.561-0.075,1.081-0.225,1.563			c-0.15,0.483-0.365,0.9-0.645,1.253c-0.28,0.353-0.624,0.63-1.031,0.832c-0.407,0.203-0.866,0.305-1.376,0.305			c-0.47,0-0.872-0.078-1.204-0.233c-0.333-0.154-0.626-0.375-0.881-0.659v3.359H335.565z M338.947,64.157			c-0.435,0-0.816,0.1-1.144,0.3c-0.328,0.2-0.629,0.482-0.904,0.848v3.675c0.245,0.33,0.514,0.562,0.806,0.697			c0.292,0.136,0.619,0.203,0.979,0.203c0.705,0,1.248-0.253,1.627-0.758c0.38-0.505,0.57-1.225,0.57-2.16			c0-0.495-0.044-0.92-0.131-1.274c-0.087-0.355-0.214-0.646-0.379-0.874s-0.367-0.394-0.607-0.499			C339.525,64.21,339.252,64.157,338.947,64.157z"/><path class="st51" d="M345.877,73.052c-0.045,0.101-0.101,0.181-0.168,0.24c-0.067,0.061-0.171,0.09-0.312,0.09h-0.99l1.388-3.015			l-3.135-7.155h1.155c0.115,0,0.205,0.029,0.27,0.086c0.065,0.058,0.113,0.122,0.143,0.191l2.033,4.785			c0.045,0.11,0.083,0.221,0.116,0.33c0.032,0.11,0.061,0.223,0.086,0.338c0.035-0.115,0.07-0.228,0.105-0.338			c0.035-0.109,0.075-0.223,0.12-0.338l1.973-4.777c0.03-0.08,0.081-0.146,0.154-0.198c0.072-0.053,0.151-0.079,0.236-0.079h1.065			L345.877,73.052z"/><path class="st51" d="M353.632,70.93c-0.6,0-1.061-0.168-1.384-0.503c-0.322-0.335-0.484-0.817-0.484-1.447v-4.65h-0.915			c-0.08,0-0.148-0.023-0.203-0.07c-0.055-0.048-0.083-0.122-0.083-0.222v-0.532l1.245-0.158L352.117,61			c0.01-0.075,0.042-0.137,0.098-0.185c0.055-0.047,0.125-0.071,0.21-0.071h0.675v2.618h2.175v0.967H353.1v4.561			c0,0.32,0.077,0.558,0.232,0.713c0.155,0.154,0.355,0.232,0.6,0.232c0.14,0,0.261-0.02,0.364-0.057s0.191-0.079,0.267-0.124			c0.075-0.045,0.139-0.086,0.191-0.123c0.053-0.038,0.099-0.057,0.139-0.057c0.07,0,0.132,0.043,0.188,0.128l0.39,0.637			c-0.23,0.216-0.507,0.384-0.833,0.507C354.312,70.868,353.977,70.93,353.632,70.93z"/><path class="st51" d="M356.925,70.809V59.762h1.335v4.471c0.325-0.346,0.685-0.621,1.08-0.829c0.395-0.207,0.85-0.312,1.365-0.312			c0.415,0,0.781,0.069,1.099,0.206c0.317,0.138,0.583,0.333,0.795,0.586c0.213,0.252,0.374,0.556,0.484,0.911			c0.11,0.354,0.165,0.747,0.165,1.177v4.838h-1.335v-4.838c0-0.574-0.131-1.021-0.394-1.338c-0.263-0.318-0.664-0.477-1.204-0.477			c-0.395,0-0.764,0.095-1.106,0.285c-0.343,0.189-0.659,0.447-0.949,0.772v5.595H356.925z"/><path class="st51" d="M368.339,63.092c0.555,0,1.056,0.093,1.504,0.277c0.447,0.186,0.827,0.448,1.14,0.788			c0.312,0.34,0.552,0.751,0.72,1.233s0.251,1.021,0.251,1.616c0,0.601-0.084,1.141-0.251,1.62c-0.167,0.48-0.408,0.891-0.72,1.23			c-0.313,0.34-0.693,0.601-1.14,0.783c-0.448,0.183-0.949,0.274-1.504,0.274c-0.555,0-1.056-0.092-1.504-0.274			c-0.447-0.183-0.829-0.443-1.144-0.783s-0.558-0.75-0.728-1.23c-0.17-0.479-0.255-1.02-0.255-1.62			c0-0.595,0.085-1.134,0.255-1.616s0.413-0.894,0.728-1.233s0.696-0.603,1.144-0.788C367.283,63.184,367.785,63.092,368.339,63.092			z M368.339,69.872c0.75,0,1.31-0.251,1.68-0.754c0.37-0.502,0.555-1.203,0.555-2.104c0-0.905-0.185-1.61-0.555-2.115			c-0.37-0.505-0.93-0.758-1.68-0.758c-0.38,0-0.71,0.065-0.99,0.195c-0.28,0.13-0.514,0.317-0.702,0.562s-0.327,0.547-0.42,0.904			c-0.092,0.357-0.139,0.761-0.139,1.211s0.046,0.853,0.139,1.207c0.093,0.355,0.232,0.654,0.42,0.896			c0.188,0.243,0.421,0.429,0.702,0.559C367.629,69.807,367.959,69.872,368.339,69.872z"/><path class="st51" d="M373.604,70.809v-7.598h0.795c0.19,0,0.31,0.093,0.36,0.277l0.105,0.825c0.33-0.365,0.699-0.66,1.106-0.885			c0.407-0.226,0.878-0.338,1.414-0.338c0.415,0,0.781,0.069,1.099,0.206c0.317,0.138,0.583,0.333,0.795,0.586			c0.213,0.252,0.374,0.556,0.484,0.911c0.11,0.354,0.165,0.747,0.165,1.177v4.838h-1.335v-4.838c0-0.574-0.131-1.021-0.394-1.338			c-0.263-0.318-0.664-0.477-1.204-0.477c-0.395,0-0.764,0.095-1.106,0.285c-0.343,0.189-0.659,0.447-0.949,0.772v5.595H373.604z"/></g>	<g class="st50">		<path class="st51" d="M335.565,121.374v-10.17h0.795c0.19,0,0.31,0.093,0.36,0.277l0.112,0.9c0.325-0.395,0.696-0.713,1.114-0.952			c0.417-0.24,0.899-0.36,1.444-0.36c0.435,0,0.83,0.084,1.185,0.251c0.355,0.168,0.657,0.415,0.908,0.743			c0.25,0.327,0.442,0.733,0.577,1.219c0.135,0.484,0.203,1.042,0.203,1.672c0,0.561-0.075,1.081-0.225,1.563			c-0.15,0.483-0.365,0.9-0.645,1.253c-0.28,0.353-0.624,0.63-1.031,0.832c-0.407,0.203-0.866,0.305-1.376,0.305			c-0.47,0-0.872-0.078-1.204-0.233c-0.333-0.154-0.626-0.375-0.881-0.659v3.359H335.565z M338.947,112.149			c-0.435,0-0.816,0.1-1.144,0.3c-0.328,0.2-0.629,0.482-0.904,0.848v3.675c0.245,0.33,0.514,0.562,0.806,0.697			c0.292,0.136,0.619,0.203,0.979,0.203c0.705,0,1.248-0.253,1.627-0.758c0.38-0.505,0.57-1.225,0.57-2.16			c0-0.495-0.044-0.92-0.131-1.274c-0.087-0.355-0.214-0.646-0.379-0.874s-0.367-0.394-0.607-0.499			C339.525,112.202,339.252,112.149,338.947,112.149z"/><path class="st51" d="M343.845,118.802v-11.048h1.335v4.471c0.325-0.346,0.685-0.621,1.08-0.829			c0.395-0.207,0.85-0.312,1.365-0.312c0.415,0,0.781,0.069,1.099,0.206c0.317,0.138,0.583,0.333,0.795,0.586			c0.213,0.252,0.374,0.556,0.484,0.911c0.11,0.354,0.165,0.747,0.165,1.177v4.838h-1.335v-4.838c0-0.574-0.131-1.021-0.394-1.338			c-0.263-0.318-0.664-0.477-1.204-0.477c-0.395,0-0.764,0.095-1.106,0.285c-0.343,0.189-0.659,0.447-0.949,0.772v5.595H343.845z"/><path class="st51" d="M352.185,121.374v-10.17h0.795c0.19,0,0.31,0.093,0.36,0.277l0.112,0.9c0.325-0.395,0.696-0.713,1.114-0.952			c0.417-0.24,0.899-0.36,1.444-0.36c0.435,0,0.83,0.084,1.185,0.251c0.355,0.168,0.657,0.415,0.908,0.743			c0.25,0.327,0.442,0.733,0.577,1.219c0.135,0.484,0.203,1.042,0.203,1.672c0,0.561-0.075,1.081-0.225,1.563			c-0.15,0.483-0.365,0.9-0.645,1.253c-0.28,0.353-0.624,0.63-1.031,0.832c-0.407,0.203-0.866,0.305-1.376,0.305			c-0.47,0-0.872-0.078-1.204-0.233c-0.333-0.154-0.626-0.375-0.881-0.659v3.359H352.185z M355.567,112.149			c-0.435,0-0.816,0.1-1.144,0.3c-0.328,0.2-0.629,0.482-0.904,0.848v3.675c0.245,0.33,0.514,0.562,0.806,0.697			c0.292,0.136,0.619,0.203,0.979,0.203c0.705,0,1.248-0.253,1.627-0.758c0.38-0.505,0.57-1.225,0.57-2.16			c0-0.495-0.044-0.92-0.131-1.274c-0.087-0.355-0.214-0.646-0.379-0.874s-0.367-0.394-0.607-0.499			C356.144,112.202,355.872,112.149,355.567,112.149z"/></g>	<g class="st50">		<path class="st52" d="M335.565,166.8v-7.598h0.765c0.145,0,0.245,0.027,0.3,0.083c0.055,0.055,0.092,0.149,0.112,0.284l0.09,1.186			c0.26-0.53,0.582-0.943,0.964-1.241c0.383-0.298,0.831-0.446,1.346-0.446c0.21,0,0.4,0.023,0.57,0.071			c0.17,0.048,0.327,0.113,0.472,0.198l-0.172,0.998c-0.035,0.125-0.112,0.188-0.232,0.188c-0.07,0-0.178-0.023-0.323-0.071			s-0.347-0.071-0.607-0.071c-0.465,0-0.854,0.135-1.166,0.405c-0.312,0.27-0.574,0.662-0.784,1.177v4.838H335.565z"/><path class="st52" d="M342.765,159.202v4.845c0,0.575,0.132,1.021,0.397,1.335c0.265,0.315,0.665,0.473,1.2,0.473			c0.39,0,0.757-0.092,1.103-0.277c0.345-0.185,0.662-0.442,0.952-0.772v-5.603h1.335v7.598h-0.795c-0.19,0-0.31-0.093-0.36-0.277			l-0.105-0.817c-0.33,0.365-0.7,0.658-1.11,0.881c-0.41,0.223-0.88,0.334-1.41,0.334c-0.415,0-0.781-0.069-1.099-0.206			c-0.318-0.138-0.584-0.331-0.799-0.582c-0.215-0.249-0.376-0.552-0.484-0.907c-0.107-0.354-0.161-0.747-0.161-1.178v-4.845			H342.765z"/><path class="st52" d="M349.995,166.8v-11.048h1.342v4.545c0.315-0.364,0.676-0.658,1.084-0.881			c0.407-0.223,0.874-0.334,1.398-0.334c0.44,0,0.837,0.083,1.193,0.248c0.355,0.165,0.657,0.411,0.907,0.738			c0.25,0.328,0.442,0.732,0.578,1.215c0.135,0.483,0.203,1.039,0.203,1.669c0,0.561-0.075,1.081-0.225,1.563			c-0.15,0.483-0.366,0.9-0.649,1.253s-0.627,0.63-1.035,0.832c-0.407,0.203-0.866,0.305-1.376,0.305			c-0.49,0-0.906-0.096-1.249-0.285c-0.342-0.19-0.641-0.455-0.896-0.795l-0.067,0.689c-0.04,0.19-0.155,0.285-0.345,0.285H349.995z			 M353.384,160.147c-0.435,0-0.816,0.1-1.144,0.3s-0.629,0.482-0.904,0.848v3.675c0.24,0.33,0.506,0.562,0.799,0.697			c0.292,0.136,0.619,0.203,0.979,0.203c0.71,0,1.255-0.253,1.635-0.758s0.57-1.225,0.57-2.16c0-0.495-0.043-0.92-0.131-1.274			c-0.088-0.355-0.214-0.646-0.379-0.874s-0.368-0.394-0.607-0.499C353.962,160.2,353.689,160.147,353.384,160.147z"/><path class="st52" d="M360.367,169.042c-0.045,0.101-0.101,0.181-0.168,0.24c-0.067,0.061-0.171,0.09-0.312,0.09h-0.99			l1.388-3.015l-3.135-7.155h1.155c0.115,0,0.205,0.029,0.27,0.086c0.065,0.058,0.113,0.122,0.143,0.191l2.033,4.785			c0.045,0.11,0.083,0.221,0.116,0.33c0.032,0.11,0.061,0.223,0.086,0.338c0.035-0.115,0.07-0.228,0.105-0.338			c0.035-0.109,0.075-0.223,0.12-0.338l1.973-4.777c0.03-0.08,0.081-0.146,0.154-0.198c0.072-0.053,0.151-0.079,0.236-0.079h1.065			L360.367,169.042z"/></g>	<g class="st50">		<path class="st51" d="M413.865,22.809v-6.457l-0.84-0.098c-0.105-0.025-0.191-0.064-0.259-0.116			c-0.068-0.053-0.102-0.129-0.102-0.229v-0.547h1.2v-0.735c0-0.435,0.061-0.821,0.184-1.158c0.123-0.338,0.297-0.623,0.525-0.855			s0.501-0.409,0.821-0.528c0.32-0.12,0.68-0.181,1.08-0.181c0.34,0,0.655,0.051,0.945,0.15l-0.03,0.667			c-0.005,0.101-0.047,0.16-0.127,0.181c-0.08,0.02-0.192,0.029-0.337,0.029h-0.232c-0.23,0-0.439,0.03-0.626,0.091			c-0.188,0.06-0.349,0.157-0.484,0.292c-0.135,0.135-0.239,0.312-0.311,0.532c-0.073,0.221-0.109,0.493-0.109,0.818v0.697h2.198			v0.967h-2.153v6.48H413.865z"/><path class="st51" d="M424.2,22.809h-0.592c-0.13,0-0.235-0.02-0.315-0.06s-0.133-0.125-0.158-0.256l-0.15-0.704			c-0.2,0.18-0.395,0.341-0.585,0.483s-0.39,0.263-0.6,0.36c-0.21,0.097-0.434,0.171-0.671,0.221			c-0.237,0.05-0.501,0.075-0.791,0.075c-0.295,0-0.571-0.042-0.829-0.124c-0.258-0.083-0.481-0.207-0.671-0.373			c-0.19-0.165-0.341-0.375-0.454-0.628c-0.113-0.254-0.169-0.554-0.169-0.899c0-0.301,0.083-0.591,0.248-0.869			s0.431-0.525,0.799-0.741c0.367-0.216,0.849-0.393,1.444-0.531c0.595-0.138,1.322-0.207,2.182-0.207v-0.596			c0-0.594-0.126-1.043-0.378-1.348c-0.252-0.304-0.626-0.456-1.122-0.456c-0.325,0-0.599,0.041-0.821,0.124			c-0.222,0.082-0.415,0.175-0.577,0.277c-0.163,0.103-0.303,0.194-0.42,0.277c-0.118,0.082-0.234,0.124-0.349,0.124			c-0.09,0-0.168-0.024-0.236-0.071c-0.068-0.048-0.122-0.106-0.162-0.177l-0.24-0.428c0.42-0.404,0.873-0.707,1.357-0.907			s1.022-0.3,1.612-0.3c0.425,0,0.803,0.07,1.133,0.21s0.607,0.335,0.833,0.585c0.225,0.25,0.395,0.553,0.51,0.907			c0.115,0.355,0.172,0.745,0.172,1.17V22.809z M420.735,21.992c0.235,0,0.45-0.023,0.645-0.071s0.379-0.115,0.551-0.202			c0.172-0.088,0.337-0.194,0.495-0.319c0.157-0.125,0.311-0.268,0.461-0.428v-1.567c-0.615,0-1.137,0.039-1.567,0.117			s-0.78,0.18-1.05,0.306s-0.466,0.274-0.589,0.445s-0.184,0.361-0.184,0.573c0,0.201,0.032,0.374,0.097,0.521			c0.065,0.146,0.153,0.265,0.263,0.358c0.11,0.093,0.24,0.161,0.39,0.203C420.397,21.971,420.56,21.992,420.735,21.992z"/><path class="st51" d="M427.71,11.762v11.048h-1.335V11.762H427.71z"/><path class="st51" d="M434.414,16.465c-0.06,0.109-0.152,0.165-0.277,0.165c-0.075,0-0.16-0.027-0.255-0.083			c-0.095-0.055-0.211-0.116-0.349-0.184c-0.138-0.067-0.301-0.13-0.492-0.188c-0.19-0.058-0.415-0.086-0.675-0.086			c-0.225,0-0.427,0.028-0.607,0.086s-0.334,0.137-0.461,0.236s-0.225,0.216-0.292,0.349s-0.101,0.276-0.101,0.432			c0,0.194,0.056,0.357,0.168,0.487c0.113,0.13,0.261,0.242,0.446,0.337c0.185,0.096,0.395,0.18,0.63,0.252			c0.235,0.072,0.476,0.149,0.724,0.232c0.248,0.082,0.489,0.174,0.724,0.273c0.235,0.101,0.445,0.226,0.63,0.375			c0.185,0.15,0.334,0.334,0.446,0.552c0.113,0.217,0.169,0.479,0.169,0.783c0,0.351-0.062,0.674-0.188,0.972			c-0.125,0.297-0.31,0.555-0.555,0.772s-0.545,0.389-0.9,0.514s-0.765,0.188-1.23,0.188c-0.53,0-1.01-0.086-1.44-0.259			c-0.43-0.173-0.795-0.394-1.095-0.664l0.315-0.51c0.04-0.064,0.087-0.115,0.143-0.15c0.055-0.034,0.127-0.052,0.218-0.052			c0.09,0,0.185,0.035,0.285,0.104c0.1,0.07,0.222,0.147,0.364,0.232c0.143,0.085,0.315,0.163,0.518,0.232			c0.203,0.07,0.457,0.105,0.761,0.105c0.26,0,0.488-0.034,0.683-0.102s0.357-0.158,0.487-0.273c0.13-0.115,0.227-0.248,0.289-0.397			c0.062-0.15,0.094-0.311,0.094-0.48c0-0.21-0.056-0.384-0.169-0.521c-0.112-0.138-0.261-0.256-0.446-0.353			c-0.185-0.098-0.396-0.183-0.634-0.256c-0.237-0.072-0.48-0.148-0.728-0.229c-0.247-0.08-0.49-0.171-0.728-0.273			c-0.237-0.103-0.449-0.231-0.633-0.387c-0.185-0.154-0.334-0.346-0.446-0.573c-0.113-0.228-0.169-0.504-0.169-0.829			c0-0.29,0.06-0.568,0.18-0.836c0.12-0.268,0.295-0.503,0.525-0.705s0.512-0.364,0.848-0.483c0.334-0.12,0.717-0.181,1.147-0.181			c0.5,0,0.949,0.079,1.346,0.236s0.741,0.374,1.031,0.649L434.414,16.465z"/><path class="st51" d="M439.582,15.092c0.455,0,0.875,0.076,1.26,0.229c0.385,0.152,0.718,0.372,0.998,0.659			c0.28,0.288,0.499,0.643,0.656,1.065c0.158,0.423,0.236,0.903,0.236,1.443c0,0.21-0.022,0.351-0.067,0.42			c-0.045,0.07-0.13,0.105-0.255,0.105h-5.055c0.01,0.479,0.075,0.897,0.195,1.252c0.12,0.355,0.285,0.651,0.495,0.89			c0.21,0.237,0.46,0.415,0.75,0.532s0.615,0.176,0.975,0.176c0.335,0,0.624-0.038,0.866-0.116c0.243-0.077,0.451-0.161,0.626-0.251			c0.175-0.09,0.321-0.174,0.438-0.251c0.118-0.078,0.219-0.116,0.304-0.116c0.11,0,0.195,0.042,0.255,0.127l0.375,0.487			c-0.165,0.2-0.362,0.374-0.592,0.521s-0.476,0.269-0.739,0.364c-0.263,0.095-0.534,0.166-0.814,0.214			c-0.28,0.047-0.557,0.071-0.832,0.071c-0.525,0-1.009-0.089-1.452-0.267c-0.442-0.178-0.825-0.438-1.147-0.78			c-0.322-0.342-0.574-0.766-0.753-1.271c-0.18-0.505-0.27-1.085-0.27-1.739c0-0.53,0.081-1.025,0.244-1.485			c0.162-0.46,0.396-0.858,0.701-1.196c0.305-0.338,0.677-0.603,1.118-0.795C438.537,15.188,439.032,15.092,439.582,15.092z			 M439.612,16.074c-0.645,0-1.152,0.187-1.522,0.56c-0.37,0.372-0.6,0.889-0.69,1.548h4.133c0-0.31-0.043-0.593-0.128-0.851			s-0.21-0.48-0.375-0.668s-0.366-0.332-0.604-0.435C440.188,16.126,439.917,16.074,439.612,16.074z"/></g>	<g class="st50">		<path class="st51" d="M413.865,71.809v-6.457l-0.84-0.098c-0.105-0.025-0.191-0.064-0.259-0.116			c-0.068-0.053-0.102-0.129-0.102-0.229v-0.547h1.2v-0.735c0-0.435,0.061-0.821,0.184-1.158c0.123-0.338,0.297-0.623,0.525-0.855			s0.501-0.409,0.821-0.528c0.32-0.12,0.68-0.181,1.08-0.181c0.34,0,0.655,0.051,0.945,0.15l-0.03,0.667			c-0.005,0.101-0.047,0.16-0.127,0.181c-0.08,0.02-0.192,0.029-0.337,0.029h-0.232c-0.23,0-0.439,0.03-0.626,0.091			c-0.188,0.06-0.349,0.157-0.484,0.292c-0.135,0.135-0.239,0.312-0.311,0.532c-0.073,0.221-0.109,0.493-0.109,0.818v0.697h2.198			v0.967h-2.153v6.48H413.865z"/><path class="st51" d="M424.2,71.809h-0.592c-0.13,0-0.235-0.02-0.315-0.06s-0.133-0.125-0.158-0.256l-0.15-0.704			c-0.2,0.18-0.395,0.341-0.585,0.483s-0.39,0.263-0.6,0.36c-0.21,0.097-0.434,0.171-0.671,0.221			c-0.237,0.05-0.501,0.075-0.791,0.075c-0.295,0-0.571-0.042-0.829-0.124c-0.258-0.083-0.481-0.207-0.671-0.373			c-0.19-0.165-0.341-0.375-0.454-0.628c-0.113-0.254-0.169-0.554-0.169-0.899c0-0.301,0.083-0.591,0.248-0.869			s0.431-0.525,0.799-0.741c0.367-0.216,0.849-0.393,1.444-0.531c0.595-0.138,1.322-0.207,2.182-0.207v-0.596			c0-0.594-0.126-1.043-0.378-1.348c-0.252-0.304-0.626-0.456-1.122-0.456c-0.325,0-0.599,0.041-0.821,0.124			c-0.222,0.082-0.415,0.175-0.577,0.277c-0.163,0.103-0.303,0.194-0.42,0.277c-0.118,0.082-0.234,0.124-0.349,0.124			c-0.09,0-0.168-0.024-0.236-0.071c-0.068-0.048-0.122-0.106-0.162-0.177l-0.24-0.428c0.42-0.404,0.873-0.707,1.357-0.907			s1.022-0.3,1.612-0.3c0.425,0,0.803,0.07,1.133,0.21s0.607,0.335,0.833,0.585c0.225,0.25,0.395,0.553,0.51,0.907			c0.115,0.355,0.172,0.745,0.172,1.17V71.809z M420.735,70.992c0.235,0,0.45-0.023,0.645-0.071s0.379-0.115,0.551-0.202			c0.172-0.088,0.337-0.194,0.495-0.319c0.157-0.125,0.311-0.268,0.461-0.428v-1.567c-0.615,0-1.137,0.039-1.567,0.117			s-0.78,0.18-1.05,0.306s-0.466,0.274-0.589,0.445s-0.184,0.361-0.184,0.573c0,0.201,0.032,0.374,0.097,0.521			c0.065,0.146,0.153,0.265,0.263,0.358c0.11,0.093,0.24,0.161,0.39,0.203C420.397,70.971,420.56,70.992,420.735,70.992z"/><path class="st51" d="M427.71,60.762v11.048h-1.335V60.762H427.71z"/><path class="st51" d="M434.414,65.465c-0.06,0.109-0.152,0.165-0.277,0.165c-0.075,0-0.16-0.027-0.255-0.083			c-0.095-0.055-0.211-0.116-0.349-0.184c-0.138-0.067-0.301-0.13-0.492-0.188c-0.19-0.058-0.415-0.086-0.675-0.086			c-0.225,0-0.427,0.028-0.607,0.086s-0.334,0.137-0.461,0.236s-0.225,0.216-0.292,0.349s-0.101,0.276-0.101,0.432			c0,0.194,0.056,0.357,0.168,0.487c0.113,0.13,0.261,0.242,0.446,0.337c0.185,0.096,0.395,0.18,0.63,0.252			c0.235,0.072,0.476,0.149,0.724,0.232c0.248,0.082,0.489,0.174,0.724,0.273c0.235,0.101,0.445,0.226,0.63,0.375			c0.185,0.15,0.334,0.334,0.446,0.552c0.113,0.217,0.169,0.479,0.169,0.783c0,0.351-0.062,0.674-0.188,0.972			c-0.125,0.297-0.31,0.555-0.555,0.772s-0.545,0.389-0.9,0.514s-0.765,0.188-1.23,0.188c-0.53,0-1.01-0.086-1.44-0.259			c-0.43-0.173-0.795-0.394-1.095-0.664l0.315-0.51c0.04-0.064,0.087-0.115,0.143-0.15c0.055-0.034,0.127-0.052,0.218-0.052			c0.09,0,0.185,0.035,0.285,0.104c0.1,0.07,0.222,0.147,0.364,0.232c0.143,0.085,0.315,0.163,0.518,0.232			c0.203,0.07,0.457,0.105,0.761,0.105c0.26,0,0.488-0.034,0.683-0.102s0.357-0.158,0.487-0.273c0.13-0.115,0.227-0.248,0.289-0.397			c0.062-0.15,0.094-0.311,0.094-0.48c0-0.21-0.056-0.384-0.169-0.521c-0.112-0.138-0.261-0.256-0.446-0.353			c-0.185-0.098-0.396-0.183-0.634-0.256c-0.237-0.072-0.48-0.148-0.728-0.229c-0.247-0.08-0.49-0.171-0.728-0.273			c-0.237-0.103-0.449-0.231-0.633-0.387c-0.185-0.154-0.334-0.346-0.446-0.573c-0.113-0.228-0.169-0.504-0.169-0.829			c0-0.29,0.06-0.568,0.18-0.836c0.12-0.268,0.295-0.503,0.525-0.705s0.512-0.364,0.848-0.483c0.334-0.12,0.717-0.181,1.147-0.181			c0.5,0,0.949,0.079,1.346,0.236s0.741,0.374,1.031,0.649L434.414,65.465z"/><path class="st51" d="M439.582,64.092c0.455,0,0.875,0.076,1.26,0.229c0.385,0.152,0.718,0.372,0.998,0.659			c0.28,0.288,0.499,0.643,0.656,1.065c0.158,0.423,0.236,0.903,0.236,1.443c0,0.21-0.022,0.351-0.067,0.42			c-0.045,0.07-0.13,0.105-0.255,0.105h-5.055c0.01,0.479,0.075,0.897,0.195,1.252c0.12,0.355,0.285,0.651,0.495,0.89			c0.21,0.237,0.46,0.415,0.75,0.532s0.615,0.176,0.975,0.176c0.335,0,0.624-0.038,0.866-0.116c0.243-0.077,0.451-0.161,0.626-0.251			c0.175-0.09,0.321-0.174,0.438-0.251c0.118-0.078,0.219-0.116,0.304-0.116c0.11,0,0.195,0.042,0.255,0.127l0.375,0.487			c-0.165,0.2-0.362,0.374-0.592,0.521s-0.476,0.269-0.739,0.364c-0.263,0.095-0.534,0.166-0.814,0.214			c-0.28,0.047-0.557,0.071-0.832,0.071c-0.525,0-1.009-0.089-1.452-0.267c-0.442-0.178-0.825-0.438-1.147-0.78			c-0.322-0.342-0.574-0.766-0.753-1.271c-0.18-0.505-0.27-1.085-0.27-1.739c0-0.53,0.081-1.025,0.244-1.485			c0.162-0.46,0.396-0.858,0.701-1.196c0.305-0.338,0.677-0.603,1.118-0.795C438.537,64.188,439.032,64.092,439.582,64.092z			 M439.612,65.074c-0.645,0-1.152,0.187-1.522,0.56c-0.37,0.372-0.6,0.889-0.69,1.548h4.133c0-0.31-0.043-0.593-0.128-0.851			s-0.21-0.48-0.375-0.668s-0.366-0.332-0.604-0.435C440.188,65.126,439.917,65.074,439.612,65.074z"/></g>	<g class="st50">		<path class="st51" d="M413.865,119.803v-6.457l-0.84-0.098c-0.105-0.025-0.191-0.064-0.259-0.116			c-0.068-0.053-0.102-0.129-0.102-0.229v-0.547h1.2v-0.735c0-0.435,0.061-0.821,0.184-1.158c0.123-0.338,0.297-0.623,0.525-0.855			s0.501-0.409,0.821-0.528c0.32-0.12,0.68-0.181,1.08-0.181c0.34,0,0.655,0.051,0.945,0.15l-0.03,0.667			c-0.005,0.101-0.047,0.16-0.127,0.181c-0.08,0.02-0.192,0.029-0.337,0.029h-0.232c-0.23,0-0.439,0.03-0.626,0.091			c-0.188,0.06-0.349,0.157-0.484,0.292c-0.135,0.135-0.239,0.312-0.311,0.532c-0.073,0.221-0.109,0.493-0.109,0.818v0.697h2.198			v0.967h-2.153v6.48H413.865z"/><path class="st51" d="M424.2,119.803h-0.592c-0.13,0-0.235-0.02-0.315-0.06s-0.133-0.125-0.158-0.256l-0.15-0.704			c-0.2,0.18-0.395,0.341-0.585,0.483s-0.39,0.263-0.6,0.36c-0.21,0.097-0.434,0.171-0.671,0.221			c-0.237,0.05-0.501,0.075-0.791,0.075c-0.295,0-0.571-0.042-0.829-0.124c-0.258-0.083-0.481-0.207-0.671-0.373			c-0.19-0.165-0.341-0.375-0.454-0.628c-0.113-0.254-0.169-0.554-0.169-0.899c0-0.301,0.083-0.591,0.248-0.869			s0.431-0.525,0.799-0.741c0.367-0.216,0.849-0.393,1.444-0.531c0.595-0.138,1.322-0.207,2.182-0.207v-0.596			c0-0.594-0.126-1.043-0.378-1.348c-0.252-0.304-0.626-0.456-1.122-0.456c-0.325,0-0.599,0.041-0.821,0.124			c-0.222,0.082-0.415,0.175-0.577,0.277c-0.163,0.103-0.303,0.194-0.42,0.277c-0.118,0.082-0.234,0.124-0.349,0.124			c-0.09,0-0.168-0.024-0.236-0.071c-0.068-0.048-0.122-0.106-0.162-0.177l-0.24-0.428c0.42-0.404,0.873-0.707,1.357-0.907			s1.022-0.3,1.612-0.3c0.425,0,0.803,0.07,1.133,0.21s0.607,0.335,0.833,0.585c0.225,0.25,0.395,0.553,0.51,0.907			c0.115,0.355,0.172,0.745,0.172,1.17V119.803z M420.735,118.985c0.235,0,0.45-0.023,0.645-0.071s0.379-0.115,0.551-0.202			c0.172-0.088,0.337-0.194,0.495-0.319c0.157-0.125,0.311-0.268,0.461-0.428v-1.567c-0.615,0-1.137,0.039-1.567,0.117			s-0.78,0.18-1.05,0.306s-0.466,0.274-0.589,0.445s-0.184,0.361-0.184,0.573c0,0.201,0.032,0.374,0.097,0.521			c0.065,0.146,0.153,0.265,0.263,0.358c0.11,0.093,0.24,0.161,0.39,0.203C420.397,118.964,420.56,118.985,420.735,118.985z"/><path class="st51" d="M427.71,108.755v11.048h-1.335v-11.048H427.71z"/><path class="st51" d="M434.414,113.458c-0.06,0.109-0.152,0.165-0.277,0.165c-0.075,0-0.16-0.027-0.255-0.083			c-0.095-0.055-0.211-0.116-0.349-0.184c-0.138-0.067-0.301-0.13-0.492-0.188c-0.19-0.058-0.415-0.086-0.675-0.086			c-0.225,0-0.427,0.028-0.607,0.086s-0.334,0.137-0.461,0.236s-0.225,0.216-0.292,0.349s-0.101,0.276-0.101,0.432			c0,0.194,0.056,0.357,0.168,0.487c0.113,0.13,0.261,0.242,0.446,0.337c0.185,0.096,0.395,0.18,0.63,0.252			c0.235,0.072,0.476,0.149,0.724,0.232c0.248,0.082,0.489,0.174,0.724,0.273c0.235,0.101,0.445,0.226,0.63,0.375			c0.185,0.15,0.334,0.334,0.446,0.552c0.113,0.217,0.169,0.479,0.169,0.783c0,0.351-0.062,0.674-0.188,0.972			c-0.125,0.297-0.31,0.555-0.555,0.772s-0.545,0.389-0.9,0.514s-0.765,0.188-1.23,0.188c-0.53,0-1.01-0.086-1.44-0.259			c-0.43-0.173-0.795-0.394-1.095-0.664l0.315-0.51c0.04-0.064,0.087-0.115,0.143-0.15c0.055-0.034,0.127-0.052,0.218-0.052			c0.09,0,0.185,0.035,0.285,0.104c0.1,0.07,0.222,0.147,0.364,0.232c0.143,0.085,0.315,0.163,0.518,0.232			c0.203,0.07,0.457,0.105,0.761,0.105c0.26,0,0.488-0.034,0.683-0.102s0.357-0.158,0.487-0.273c0.13-0.115,0.227-0.248,0.289-0.397			c0.062-0.15,0.094-0.311,0.094-0.48c0-0.21-0.056-0.384-0.169-0.521c-0.112-0.138-0.261-0.256-0.446-0.353			c-0.185-0.098-0.396-0.183-0.634-0.256c-0.237-0.072-0.48-0.148-0.728-0.229c-0.247-0.08-0.49-0.171-0.728-0.273			c-0.237-0.103-0.449-0.231-0.633-0.387c-0.185-0.154-0.334-0.346-0.446-0.573c-0.113-0.228-0.169-0.504-0.169-0.829			c0-0.29,0.06-0.568,0.18-0.836c0.12-0.268,0.295-0.503,0.525-0.705s0.512-0.364,0.848-0.483c0.334-0.12,0.717-0.181,1.147-0.181			c0.5,0,0.949,0.079,1.346,0.236s0.741,0.374,1.031,0.649L434.414,113.458z"/><path class="st51" d="M439.582,112.085c0.455,0,0.875,0.076,1.26,0.229c0.385,0.152,0.718,0.372,0.998,0.659			c0.28,0.288,0.499,0.643,0.656,1.065c0.158,0.423,0.236,0.903,0.236,1.443c0,0.21-0.022,0.351-0.067,0.42			c-0.045,0.07-0.13,0.105-0.255,0.105h-5.055c0.01,0.479,0.075,0.897,0.195,1.252c0.12,0.355,0.285,0.651,0.495,0.89			c0.21,0.237,0.46,0.415,0.75,0.532s0.615,0.176,0.975,0.176c0.335,0,0.624-0.038,0.866-0.116c0.243-0.077,0.451-0.161,0.626-0.251			c0.175-0.09,0.321-0.174,0.438-0.251c0.118-0.078,0.219-0.116,0.304-0.116c0.11,0,0.195,0.042,0.255,0.127l0.375,0.487			c-0.165,0.2-0.362,0.374-0.592,0.521s-0.476,0.269-0.739,0.364c-0.263,0.095-0.534,0.166-0.814,0.214			c-0.28,0.047-0.557,0.071-0.832,0.071c-0.525,0-1.009-0.089-1.452-0.267c-0.442-0.178-0.825-0.438-1.147-0.78			c-0.322-0.342-0.574-0.766-0.753-1.271c-0.18-0.505-0.27-1.085-0.27-1.739c0-0.53,0.081-1.025,0.244-1.485			c0.162-0.46,0.396-0.858,0.701-1.196c0.305-0.338,0.677-0.603,1.118-0.795C438.537,112.181,439.032,112.085,439.582,112.085z			 M439.612,113.067c-0.645,0-1.152,0.187-1.522,0.56c-0.37,0.372-0.6,0.889-0.69,1.548h4.133c0-0.31-0.043-0.593-0.128-0.851			s-0.21-0.48-0.375-0.668s-0.366-0.332-0.604-0.435C440.188,113.119,439.917,113.067,439.612,113.067z"/></g>	<g class="st50">		<path class="st52" d="M420.979,158.595h2.532c0.382,0,0.653,0.069,0.813,0.207c0.161,0.139,0.241,0.368,0.241,0.689			c0,0.326-0.082,0.562-0.245,0.705c-0.164,0.145-0.433,0.217-0.81,0.217h-2.532v2.125c0,0.598,0.091,1.007,0.274,1.229			c0.183,0.221,0.503,0.332,0.963,0.332c0.432,0,0.941-0.125,1.527-0.374s0.979-0.374,1.179-0.374c0.227,0,0.422,0.091,0.585,0.271			c0.164,0.18,0.245,0.396,0.245,0.651c0,0.426-0.386,0.814-1.158,1.166c-0.771,0.352-1.647,0.527-2.627,0.527			c-0.57,0-1.071-0.077-1.502-0.232s-0.772-0.376-1.021-0.664c-0.183-0.222-0.312-0.487-0.39-0.797s-0.116-0.827-0.116-1.553v-0.182			v-2.125h-0.78c-0.376,0-0.643-0.072-0.801-0.217c-0.157-0.144-0.236-0.379-0.236-0.705s0.078-0.558,0.232-0.693			s0.423-0.203,0.805-0.203h0.78v-1.942c0-0.382,0.079-0.65,0.237-0.806c0.157-0.154,0.419-0.232,0.784-0.232			s0.627,0.078,0.784,0.232c0.158,0.155,0.237,0.424,0.237,0.806V158.595z"/><path class="st52" d="M431.38,161.292v2.689h1.959c0.376,0,0.643,0.069,0.801,0.208c0.157,0.139,0.236,0.368,0.236,0.688			c0,0.327-0.079,0.562-0.236,0.706c-0.158,0.144-0.425,0.216-0.801,0.216h-4.64c-0.382,0-0.653-0.072-0.813-0.216			s-0.241-0.379-0.241-0.706c0-0.32,0.079-0.55,0.238-0.688c0.158-0.139,0.432-0.208,0.822-0.208h0.634v-4.033h-0.359			c-0.379,0-0.647-0.071-0.806-0.212c-0.159-0.142-0.238-0.375-0.238-0.702c0-0.326,0.076-0.559,0.229-0.697			c0.152-0.138,0.422-0.207,0.809-0.207h1.768c0.149,0,0.266,0.032,0.349,0.096s0.125,0.15,0.125,0.262v1.229			c0.603-0.648,1.167-1.11,1.689-1.387c0.523-0.276,1.086-0.415,1.689-0.415c0.548,0,0.982,0.123,1.303,0.369			s0.481,0.577,0.481,0.992c0,0.321-0.111,0.585-0.332,0.793c-0.221,0.207-0.506,0.312-0.855,0.312			c-0.249,0-0.544-0.092-0.884-0.274c-0.341-0.183-0.577-0.274-0.71-0.274c-0.266,0-0.578,0.119-0.938,0.357			S431.873,160.794,431.38,161.292z"/><path class="st52" d="M443.267,159.948h-0.133c-0.299,0-0.524-0.078-0.677-0.232c-0.152-0.155-0.228-0.383-0.228-0.682			c0-0.326,0.078-0.559,0.232-0.697c0.155-0.138,0.423-0.207,0.805-0.207h1.569c0.149,0,0.266,0.032,0.349,0.096			s0.125,0.15,0.125,0.262v5.494h0.133c0.299,0,0.527,0.078,0.685,0.232c0.158,0.155,0.237,0.377,0.237,0.664			c0,0.332-0.08,0.569-0.241,0.71c-0.161,0.142-0.432,0.212-0.813,0.212h-1.395c-0.155,0-0.275-0.033-0.361-0.1			c-0.085-0.066-0.128-0.158-0.128-0.273v-0.631c-0.266,0.398-0.591,0.697-0.975,0.896c-0.385,0.199-0.837,0.299-1.357,0.299			c-0.891,0-1.552-0.269-1.984-0.806s-0.647-1.358-0.647-2.466v-2.771h-0.141c-0.299,0-0.526-0.078-0.681-0.232			c-0.155-0.155-0.232-0.383-0.232-0.682c0-0.326,0.079-0.559,0.236-0.697c0.158-0.138,0.431-0.207,0.818-0.207h1.561			c0.149,0,0.263,0.032,0.34,0.096s0.116,0.15,0.116,0.262v3.859c0,0.681,0.094,1.159,0.282,1.436			c0.188,0.277,0.498,0.416,0.93,0.416c0.459,0,0.837-0.171,1.133-0.511c0.296-0.341,0.444-0.787,0.444-1.341V159.948z"/><path class="st52" d="M449.899,162.454c0.144,0.615,0.422,1.074,0.834,1.379c0.413,0.304,0.962,0.456,1.648,0.456			s1.364-0.167,2.034-0.502s1.074-0.503,1.212-0.503c0.205,0,0.372,0.076,0.502,0.229c0.13,0.152,0.195,0.348,0.195,0.586			c0,0.52-0.385,0.968-1.154,1.344c-0.769,0.377-1.721,0.564-2.855,0.564c-1.339,0-2.428-0.376-3.266-1.129			c-0.839-0.752-1.258-1.721-1.258-2.904c0-1.18,0.419-2.145,1.258-2.897c0.838-0.753,1.927-1.129,3.266-1.129			c1.195,0,2.186,0.353,2.972,1.059c0.786,0.705,1.179,1.57,1.179,2.594c0,0.326-0.079,0.551-0.237,0.673			c-0.157,0.121-0.482,0.182-0.975,0.182H449.899z M454.373,161.159c-0.094-0.514-0.336-0.912-0.726-1.195			c-0.391-0.281-0.898-0.423-1.523-0.423c-0.603,0-1.089,0.134-1.457,0.402c-0.368,0.269-0.624,0.674-0.768,1.216H454.373z"/></g>	<g>		<path class="st52" d="M395.781,167.243c-0.271,0-0.521-0.052-0.732-0.155c-0.22-0.104-0.43-0.229-0.627-0.42l-3.695-3.713			c-0.188-0.186-0.312-0.396-0.42-0.637c-0.092-0.238-0.139-0.479-0.139-0.728c0-0.241,0.047-0.479,0.139-0.729			c0.094-0.229,0.232-0.438,0.42-0.604c0.188-0.188,0.396-0.328,0.646-0.437c0.229-0.104,0.479-0.146,0.725-0.146			s0.482,0.054,0.715,0.146c0.233,0.104,0.441,0.229,0.627,0.437l2.354,2.354l5.938-5.963c0.188-0.188,0.396-0.325,0.636-0.418			c0.229-0.097,0.479-0.144,0.729-0.144s0.49,0.047,0.729,0.144c0.229,0.093,0.438,0.229,0.631,0.418			c0.188,0.188,0.314,0.396,0.401,0.628c0.094,0.229,0.14,0.479,0.14,0.729s-0.046,0.479-0.14,0.728			c-0.087,0.229-0.224,0.438-0.401,0.627l-7.312,7.312c-0.174,0.185-0.375,0.312-0.604,0.424			C396.296,167.193,396.049,167.243,395.781,167.243z"/></g>	<line class="st53" x1="390.244" y1="17.902" x2="401.244" y2="17.902"/><line class="st53" x1="390.244" y1="64.9" x2="401.244" y2="64.9"/><line class="st53" x1="390.244" y1="113.891" x2="401.244" y2="113.891"/><g>		<g>			<polyline class="st53" points="275.3,19.33 200.663,19.33 170.722,49.27 			"/><g>				<circle class="st51" cx="170.802" cy="49.19" r="2.256"/></g>		</g>	</g>	<g>		<g>			<polyline class="st53" points="275.3,60.629 226.037,60.629 215.595,71.07 			"/><g>				<circle class="st51" cx="215.675" cy="70.99" r="2.256"/></g>		</g>	</g>	<g>		<g>			<polyline class="st54" points="275.3,160.736 199.221,160.736 170.722,132.237 			"/><g>				<circle class="st55" cx="170.802" cy="132.316" r="2.256"/></g>		</g>	</g>	<g>		<g>			<polyline class="st53" points="275.3,120.879 226.037,120.879 215.595,110.437 			"/><g>				<circle class="st51" cx="215.675" cy="110.517" r="2.256"/></g>		</g>	</g>	<path class="st53" d="M275.3,169.353"/><use xlink:href="#Ruby"  width="64.608" height="64.608" x="-32.304" y="-32.304" transform="matrix(0.5889 0 0 -0.5889 301.5469 163.3497)" style="overflow:visible;"/></g><g id="proxy-router" data-size="297x200" class="nanobox-svg ">	<polygon class="st19" points="242.472,106.956 122.666,168.711 0,105.847 119.811,44.092 	"/><polygon class="st20" points="139.545,120.849 97.273,143.061 76.124,132.154 118.408,109.956 	"/><polygon class="st21" points="76.124,132.021 118.408,109.819 118.408,124.467 90.064,139.347 	"/><polyline class="st22" points="118.408,109.819 118.408,124.467 125.555,128.198 139.545,120.849 	"/><polygon class="st20" points="112.719,106.947 70.442,129.157 49.295,118.257 91.583,96.054 	"/><polygon class="st21" points="49.295,118.114 91.583,95.912 91.583,110.562 63.243,125.44 	"/><polyline class="st22" points="91.583,95.912 91.583,110.562 98.729,114.292 112.719,106.947 	"/><polygon class="st20" points="85.892,92.903 43.616,115.112 22.469,104.21 64.754,82.009 	"/><polygon class="st21" points="22.469,104.071 64.754,81.867 64.754,96.517 36.412,111.398 	"/><polyline class="st22" points="64.754,81.867 64.754,96.517 71.9,100.248 85.892,92.903 	"/><polygon class="st22" points="122.666,168.873 242.472,107.119 242.472,137.738 122.666,199.492 	"/><polygon class="st21" points="122.666,168.873 0,105.847 0,136.467 122.666,199.492 	"/><polygon class="st20" points="221.152,106.123 199.061,117.828 177.914,106.925 200.015,95.228 	"/><polygon class="st21" points="177.914,106.787 200.015,95.088 200.015,109.738 191.855,114.114 	"/><polyline class="st22" points="200.015,95.088 200.015,109.738 207.165,113.473 221.152,106.123 	"/><polygon class="st20" points="194.327,92.078 152.052,114.291 130.905,103.386 173.189,81.184 	"/><polygon class="st21" points="130.905,103.247 173.189,81.051 173.189,95.693 144.847,110.571 	"/><polyline class="st22" points="173.189,81.051 173.189,95.693 180.339,99.427 194.327,92.078 	"/><polygon class="st20" points="167.495,78.174 125.224,100.384 104.078,89.479 146.361,67.281 	"/><polygon class="st21" points="104.078,89.341 146.361,67.141 146.361,81.79 118.021,96.665 	"/><polyline class="st22" points="146.361,67.141 146.361,81.79 153.511,85.523 167.495,78.174 	"/><polygon class="st20" points="140.673,64.129 98.398,86.339 77.249,75.435 119.535,53.236 	"/><polygon class="st21" points="77.249,75.298 119.535,53.099 119.535,67.743 91.196,82.622 	"/><polyline class="st22" points="119.535,53.099 119.535,67.743 126.686,71.479 140.673,64.129 	"/><g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_26_" points="221.152,106.123 199.061,117.828 177.914,106.925 200.015,95.228 												"/></defs>											<clipPath id="SVGID_27_">												<use xlink:href="#SVGID_26_"  style="overflow:visible;"/></clipPath>											<polygon class="st56" points="217.241,106.737 200.021,115.616 182.792,106.737 200.024,97.858 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_28_" points="221.152,106.123 199.061,117.828 177.914,106.925 200.015,95.228 												"/></defs>											<clipPath id="SVGID_29_">												<use xlink:href="#SVGID_28_"  style="overflow:visible;"/></clipPath>											<polygon class="st57" points="217.241,120.36 217.241,106.737 200.021,115.616 200.021,128.807 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_30_" points="221.152,106.123 199.061,117.828 177.914,106.925 200.015,95.228 												"/></defs>											<clipPath id="SVGID_31_">												<use xlink:href="#SVGID_30_"  style="overflow:visible;"/></clipPath>											<polygon class="st58" points="200.021,115.616 182.792,106.737 182.792,120.001 200.021,128.807 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_32_" points="85.892,92.903 43.616,115.112 22.469,104.21 64.754,82.009 												"/></defs>											<clipPath id="SVGID_33_">												<use xlink:href="#SVGID_32_"  style="overflow:visible;"/></clipPath>											<g class="st59">												<polygon class="st60" points="80.214,92.77 43.375,112.063 27.766,103.99 64.615,84.705 												"/><polygon class="st61" points="80.214,106.39 80.214,92.772 43.375,112.063 43.374,125.251 												"/><polygon class="st62" points="43.375,112.063 27.766,103.99 27.766,117.251 43.374,125.251 												"/></g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_34_" points="112.717,106.95 70.442,129.159 49.295,118.257 91.579,96.056 												"/></defs>											<clipPath id="SVGID_35_">												<use xlink:href="#SVGID_34_"  style="overflow:visible;"/></clipPath>											<g class="st63">												<polygon class="st64" points="107.039,106.818 70.201,126.109 54.591,118.036 91.439,98.751 												"/><polygon class="st65" points="107.039,120.436 107.039,106.818 70.201,126.109 70.199,139.297 												"/><polygon class="st66" points="70.201,126.109 54.591,118.036 54.591,131.297 70.199,139.297 												"/></g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_36_" points="139.542,120.996 97.267,143.205 76.12,132.303 118.405,110.102 												"/></defs>											<clipPath id="SVGID_37_">												<use xlink:href="#SVGID_36_"  style="overflow:visible;"/></clipPath>											<g class="st67">												<polygon class="st68" points="133.865,120.863 97.026,140.156 81.417,132.082 118.266,112.798 												"/><polygon class="st69" points="133.865,134.483 133.865,120.865 97.026,140.156 97.025,153.344 												"/><polygon class="st70" points="97.026,140.156 81.417,132.082 81.417,145.344 97.025,153.344 												"/></g>										</g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<g>		<g>			<path class="st71" d="M200.015,102.221v-7.133c0-39.226-31.799-71.026-71.021-71.026c-31.568,0-58.326,20.596-67.57,49.082"/><g>				<path class="st72" d="M60.452,76.385c-0.082-1.695-0.445-3.882-1.092-5.372l2.249,1.725l2.832-0.113					C63.053,73.469,61.495,75.046,60.452,76.385z"/></g>		</g>	</g>	<g>		<g>			<path class="st73" d="M64.162,95.894c0-5.896,0.788-11.61,2.267-17.038c7.479-27.47,32.604-47.668,62.438-47.668				c34.603,0,62.854,27.16,64.62,61.324"/><g>				<path class="st60" d="M193.574,95.894c-0.646-1.573-1.705-3.516-2.812-4.708l2.693,0.883l2.634-1.044					C195.062,92.282,194.116,94.286,193.574,95.894z"/></g>		</g>	</g>	<g>		<g>			<line class="st73" x1="210.832" y1="103.432" x2="293.262" y2="61.465"/><g>				<path class="st60" d="M296.276,59.931c-1.15,1.248-2.453,3.042-3.062,4.548l-0.35-2.812l-2.068-1.937					C292.373,60.125,294.59,60.127,296.276,59.931z"/></g>		</g>	</g>	<g>					<linearGradient id="SVGID_38_" gradientUnits="userSpaceOnUse" x1="-266.388" y1="3316.9126" x2="-176.1442" y2="3364.2556" gradientTransform="matrix(1 0 0 -1 464 3420)">			<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>		<polygon class="st74" points="196.726,103.402 196.358,102.69 287.932,55.856 288.299,56.567 		"/></g>	<polygon class="st20" points="183.582,125.9 161.765,137.46 140.884,126.692 162.709,115.142 	"/><polygon class="st21" points="140.884,126.557 162.709,115.002 162.709,129.468 154.651,133.791 	"/><g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_39_" points="183.895,125.754 161.8,137.46 140.655,126.557 162.756,114.86 												"/></defs>											<clipPath id="SVGID_40_">												<use xlink:href="#SVGID_39_"  style="overflow:visible;"/></clipPath>											<polygon class="st75" points="179.982,126.369 162.762,135.248 145.534,126.369 162.765,117.49 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_41_" points="183.895,125.754 161.8,137.46 140.655,126.557 162.756,114.86 												"/></defs>											<clipPath id="SVGID_42_">												<use xlink:href="#SVGID_41_"  style="overflow:visible;"/></clipPath>											<polygon class="st76" points="179.982,139.992 179.982,126.369 162.762,135.248 162.762,148.438 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_43_" points="183.895,125.754 161.8,137.46 140.655,126.557 162.756,114.86 												"/></defs>											<clipPath id="SVGID_44_">												<use xlink:href="#SVGID_43_"  style="overflow:visible;"/></clipPath>											<polygon class="st77" points="162.762,135.248 145.534,126.369 145.534,139.633 162.762,148.438 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<polygon class="st20" points="144.841,145.527 122.75,157.232 101.604,146.331 123.703,134.634 	"/><polygon class="st21" points="101.604,146.193 123.703,134.494 123.703,149.142 115.543,153.519 	"/><polyline class="st22" points="123.703,134.494 123.703,149.142 131.571,153.236 145.559,145.885 	"/><linearGradient id="SVGID_45_" gradientUnits="userSpaceOnUse" x1="-255.42" y1="3377.9658" x2="-255.42" y2="3304.4272" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#FFFFFF;stop-opacity:0"/><stop  offset="1" style="stop-color:#FFFFFF"/></linearGradient>	<polygon class="st78" points="217.14,106.876 217.14,0 200.02,8.831 200.02,115.276 	"/><linearGradient id="SVGID_46_" gradientUnits="userSpaceOnUse" x1="-272.545" y1="3377.9658" x2="-272.545" y2="3304.4272" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#FFFFFF;stop-opacity:0"/><stop  offset="1" style="stop-color:#8C8C8C"/></linearGradient>	<polygon class="st79" points="200.02,8.831 182.89,0 182.89,106.519 200.02,115.276 	"/></g><g id="boxfile" data-size="315x155" class="nanobox-svg ">	<rect x="193.276" class="st21" width="111.343" height="154.404"/><rect x="207.134" y="17.413" class="st0" width="27.585" height="4.686"/><rect x="215.419" y="28.005" class="st0" width="34.759" height="4.676"/><rect x="215.419" y="38.595" class="st0" width="34.759" height="4.677"/><rect x="255.901" y="28.005" class="st0" width="18.188" height="4.676"/><rect x="255.901" y="38.595" class="st0" width="8.253" height="4.677"/><rect x="215.419" y="79.367" class="st80" width="34.759" height="4.677"/><rect x="215.419" y="89.958" class="st80" width="34.759" height="4.685"/><rect x="255.901" y="79.367" class="st80" width="18.188" height="4.677"/><rect x="215.419" y="50.108" class="st0" width="34.759" height="4.676"/><rect x="255.901" y="50.108" class="st0" width="18.188" height="4.676"/><rect x="255.901" y="89.958" class="st80" width="8.253" height="4.685"/><rect x="207.134" y="68.775" class="st80" width="27.585" height="4.677"/><rect x="215.419" y="118.179" class="st81" width="34.759" height="4.677"/><rect x="215.419" y="128.77" class="st81" width="34.759" height="4.677"/><rect x="255.901" y="118.179" class="st81" width="18.188" height="4.677"/><rect x="255.901" y="128.77" class="st81" width="8.253" height="4.677"/><rect x="207.134" y="107.588" class="st81" width="27.585" height="4.677"/><circle class="st0" cx="298.42" cy="27.21" r="13.854"/><linearGradient id="SVGID_47_" gradientUnits="userSpaceOnUse" x1="-157.9203" y1="3369.2903" x2="-162.865" y2="3393.3064" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#EC4A54"/><stop  offset="0.166" style="stop-color:#E84852"/><stop  offset="0.3386" style="stop-color:#DB434B"/><stop  offset="0.5143" style="stop-color:#C73A41"/><stop  offset="0.6919" style="stop-color:#A92E32"/><stop  offset="0.8695" style="stop-color:#841E1F"/><stop  offset="1" style="stop-color:#64100E"/></linearGradient>	<polygon class="st82" points="305.6,30.71 301.535,25.917 298.41,31.128 	"/><polygon class="st4" points="301.535,25.917 304.87,23.73 305.6,30.71 	"/><linearGradient id="SVGID_48_" gradientUnits="userSpaceOnUse" x1="-148.3102" y1="3388.2678" x2="-160.4865" y2="3394.7971" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#EC4A54"/><stop  offset="0.166" style="stop-color:#E84852"/><stop  offset="0.3386" style="stop-color:#DB434B"/><stop  offset="0.5143" style="stop-color:#C73A41"/><stop  offset="0.6919" style="stop-color:#A92E32"/><stop  offset="0.8695" style="stop-color:#841E1F"/><stop  offset="1" style="stop-color:#64100E"/></linearGradient>	<polygon class="st83" points="305.6,30.71 309.038,25.917 304.87,21.542 304.87,23.73 	"/><polygon class="st6" points="291.22,30.71 295.284,25.917 298.41,31.128 	"/><polygon class="st4" points="295.284,25.917 291.951,23.73 291.22,30.71 	"/><polygon class="st4" points="295.284,25.917 291.951,23.73 291.22,30.71 	"/><linearGradient id="SVGID_49_" gradientUnits="userSpaceOnUse" x1="-173.4676" y1="3389.9375" x2="-171.4077" y2="3393.4355" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>	<polygon class="st84" points="295.284,25.917 291.951,23.73 291.22,30.71 	"/><polygon class="st8" points="291.22,30.293 287.782,25.917 291.951,21.542 291.951,23.73 	"/><linearGradient id="SVGID_50_" gradientUnits="userSpaceOnUse" x1="-168.2908" y1="3396.4878" x2="-174.3268" y2="3392.967" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>	<polygon class="st85" points="291.22,30.293 287.782,25.917 291.951,21.542 291.951,23.73 	"/><linearGradient id="SVGID_51_" gradientUnits="userSpaceOnUse" x1="-176.256" y1="3391.9031" x2="-166.5281" y2="3397.4219" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#61100D"/><stop  offset="0.1734" style="stop-color:#65100F;stop-opacity:0.8266"/><stop  offset="0.3537" style="stop-color:#721115;stop-opacity:0.6463"/><stop  offset="0.537" style="stop-color:#86131F;stop-opacity:0.463"/><stop  offset="0.7226" style="stop-color:#A4162D;stop-opacity:0.2774"/><stop  offset="0.9081" style="stop-color:#C9193F;stop-opacity:0.0919"/><stop  offset="1" style="stop-color:#DE1B49;stop-opacity:0"/></linearGradient>	<polygon class="st86" points="291.22,30.293 287.782,25.917 291.951,21.542 291.951,23.73 	"/><linearGradient id="SVGID_52_" gradientUnits="userSpaceOnUse" x1="-168.1335" y1="3394.1846" x2="-164.548" y2="3391.8206" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#EB3842"/><stop  offset="1" style="stop-color:#AA1F26"/></linearGradient>	<polygon class="st87" points="298.41,25.917 295.284,25.917 295.284,25.917 298.41,31.128 301.535,25.917 301.535,25.917 	"/><linearGradient id="SVGID_53_" gradientUnits="userSpaceOnUse" x1="-169.4987" y1="3389.0896" x2="-164.2812" y2="3394.4011" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0.42"/></linearGradient>	<polygon class="st88" points="298.41,25.917 295.284,25.917 295.284,25.917 298.41,31.128 301.535,25.917 301.535,25.917 	"/><polygon class="st13" points="302.005,19.843 298.41,19.843 294.814,19.843 291.951,21.542 291.951,23.73 295.284,25.917 		298.41,25.917 301.535,25.917 304.87,23.73 304.87,21.542 	"/><linearGradient id="SVGID_54_" gradientUnits="userSpaceOnUse" x1="-156.9191" y1="3407.752" x2="-166.4899" y2="3396.2852" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>	<polygon class="st89" points="302.005,19.843 298.41,19.843 294.814,19.843 291.951,21.542 291.951,23.73 295.284,25.917 		298.41,25.917 301.535,25.917 304.87,23.73 304.87,21.542 	"/><polygon class="st1" points="298.423,31.126 298.423,36.013 305.6,30.71 	"/><linearGradient id="SVGID_55_" gradientUnits="userSpaceOnUse" x1="-152.8648" y1="3379.6047" x2="-171.6345" y2="3389.6697" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#EC4A54"/><stop  offset="0.166" style="stop-color:#E84852"/><stop  offset="0.3386" style="stop-color:#DB434B"/><stop  offset="0.5143" style="stop-color:#C73A41"/><stop  offset="0.6919" style="stop-color:#A92E32"/><stop  offset="0.8695" style="stop-color:#841E1F"/><stop  offset="1" style="stop-color:#64100E"/></linearGradient>	<polygon class="st90" points="298.423,31.126 298.41,31.128 291.22,30.71 298.41,36.024 298.423,36.013 	"/><g>		<circle class="st81" cx="300.126" cy="124.695" r="13.993"/></g>	<g>		<circle class="st80" cx="300.126" cy="76.316" r="13.993"/></g>	<path class="st91" d="M299.857,133.845c6.014,0,8.104-4.324,8.104-7.229c0-2.896-0.74-7.14-4.663-11.062		c0,2.729-0.023,6.171-3.189,6.171"/><path class="st91" d="M300.36,133.845c-6.02,0-8.11-4.324-8.11-7.229c0-2.896,0.738-7.14,4.662-11.062		c0,2.729,0.029,6.171,3.197,6.171"/><g>		<circle class="st91" cx="304.576" cy="126.374" r="1.803"/></g>	<g>		<path class="st92" d="M304.576,124.78c0.88,0,1.595,0.714,1.595,1.594c0,0.888-0.714,1.602-1.595,1.602s-1.596-0.714-1.596-1.602			C302.98,125.494,303.694,124.78,304.576,124.78 M304.576,123.942c-1.341,0-2.438,1.091-2.438,2.432			c0,1.349,1.099,2.438,2.438,2.438s2.433-1.091,2.433-2.438C307.009,125.033,305.917,123.942,304.576,123.942L304.576,123.942z"/></g>	<g>		<polyline class="st93" points="300.346,127.821 300.346,130.932 298.537,132.683 		"/><line class="st93" x1="302.164" y1="132.631" x2="300.346" y2="130.755"/></g>	<g>		<circle class="st91" cx="296.145" cy="126.374" r="1.802"/></g>	<polygon class="st94" points="301.367,127.551 300.36,128.559 299.352,127.551 	"/><g>		<path class="st92" d="M296.145,124.78c0.888,0,1.602,0.714,1.602,1.594c0,0.888-0.713,1.602-1.602,1.602			c-0.881,0-1.594-0.714-1.594-1.602C294.551,125.494,295.264,124.78,296.145,124.78 M296.145,123.942			c-1.341,0-2.432,1.091-2.432,2.432c0,1.349,1.091,2.438,2.432,2.438c1.349,0,2.438-1.091,2.438-2.438			C298.577,125.033,297.485,123.942,296.145,123.942L296.145,123.942z"/></g>	<g class="st50">		<path class="st0" d="M113.889,55.285v-8.61h0.867c0.165,0,0.278,0.031,0.34,0.094c0.062,0.062,0.104,0.17,0.127,0.322l0.102,1.344			c0.294-0.601,0.659-1.07,1.092-1.407c0.434-0.337,0.942-0.506,1.526-0.506c0.238,0,0.454,0.027,0.646,0.081			c0.193,0.054,0.371,0.129,0.536,0.226l-0.195,1.13c-0.04,0.142-0.128,0.213-0.264,0.213c-0.08,0-0.201-0.027-0.366-0.081			c-0.164-0.054-0.394-0.081-0.688-0.081c-0.527,0-0.968,0.153-1.322,0.459c-0.354,0.307-0.65,0.751-0.888,1.335v5.482H113.889z"/><path class="st0" d="M126.74,55.285h-0.671c-0.147,0-0.267-0.022-0.357-0.068c-0.091-0.045-0.15-0.142-0.179-0.289l-0.17-0.799			c-0.227,0.204-0.448,0.387-0.663,0.549c-0.215,0.161-0.442,0.297-0.68,0.407c-0.238,0.111-0.492,0.194-0.761,0.251			c-0.27,0.057-0.568,0.085-0.897,0.085c-0.334,0-0.647-0.047-0.939-0.141c-0.292-0.094-0.545-0.234-0.761-0.422			s-0.387-0.425-0.514-0.712c-0.127-0.288-0.191-0.627-0.191-1.02c0-0.341,0.093-0.67,0.28-0.985s0.489-0.596,0.905-0.84			c0.417-0.245,0.962-0.445,1.636-0.602s1.499-0.234,2.474-0.234V49.79c0-0.673-0.143-1.182-0.429-1.526			c-0.287-0.346-0.71-0.518-1.271-0.518c-0.368,0-0.679,0.046-0.931,0.14c-0.252,0.094-0.47,0.198-0.654,0.314			c-0.185,0.116-0.343,0.222-0.476,0.314c-0.133,0.094-0.265,0.141-0.396,0.141c-0.102,0-0.191-0.027-0.268-0.081			s-0.138-0.12-0.183-0.199l-0.272-0.484c0.476-0.459,0.989-0.803,1.538-1.029c0.55-0.227,1.159-0.34,1.828-0.34			c0.481,0,0.91,0.08,1.284,0.238s0.688,0.38,0.943,0.663s0.448,0.626,0.578,1.028s0.195,0.845,0.195,1.326V55.285z M122.813,54.358			c0.266,0,0.51-0.026,0.731-0.08c0.221-0.055,0.429-0.131,0.625-0.229c0.196-0.1,0.383-0.22,0.561-0.361			c0.179-0.142,0.353-0.304,0.523-0.484v-1.777c-0.697,0-1.29,0.045-1.777,0.133c-0.487,0.089-0.884,0.204-1.19,0.347			c-0.306,0.143-0.528,0.311-0.667,0.504c-0.139,0.194-0.208,0.41-0.208,0.65c0,0.228,0.037,0.424,0.111,0.59			c0.073,0.165,0.172,0.301,0.297,0.406c0.125,0.104,0.272,0.182,0.442,0.23S122.615,54.358,122.813,54.358z"/><path class="st0" d="M131.059,43.971c0,0.147-0.03,0.285-0.089,0.412c-0.06,0.128-0.139,0.241-0.238,0.34			c-0.099,0.1-0.214,0.178-0.344,0.234s-0.269,0.085-0.417,0.085c-0.147,0-0.285-0.028-0.412-0.085s-0.241-0.135-0.34-0.234			c-0.099-0.099-0.177-0.212-0.234-0.34c-0.057-0.127-0.085-0.265-0.085-0.412s0.028-0.287,0.085-0.421			c0.057-0.133,0.135-0.249,0.234-0.349c0.099-0.099,0.212-0.177,0.34-0.233s0.265-0.085,0.412-0.085			c0.147,0,0.286,0.028,0.417,0.085s0.245,0.135,0.344,0.233c0.099,0.1,0.179,0.216,0.238,0.349			C131.029,43.684,131.059,43.824,131.059,43.971z M130.718,46.674v8.61h-1.513v-8.61H130.718z"/><path class="st0" d="M135.07,42.764v12.521h-1.513V42.764H135.07z"/><path class="st0" d="M142.669,48.093c-0.068,0.125-0.173,0.188-0.314,0.188c-0.085,0-0.181-0.031-0.289-0.094			c-0.107-0.062-0.239-0.132-0.395-0.208c-0.156-0.076-0.342-0.147-0.557-0.213c-0.216-0.064-0.471-0.098-0.765-0.098			c-0.255,0-0.484,0.033-0.688,0.098c-0.204,0.065-0.378,0.154-0.523,0.268c-0.145,0.114-0.255,0.246-0.332,0.396			c-0.076,0.15-0.115,0.313-0.115,0.489c0,0.221,0.064,0.405,0.191,0.552c0.127,0.147,0.296,0.275,0.506,0.383			c0.209,0.107,0.447,0.203,0.714,0.285c0.266,0.082,0.54,0.17,0.82,0.264c0.28,0.093,0.554,0.196,0.82,0.31			c0.266,0.113,0.504,0.255,0.714,0.425c0.209,0.171,0.378,0.379,0.506,0.625c0.127,0.247,0.191,0.543,0.191,0.889			c0,0.396-0.071,0.764-0.212,1.101s-0.351,0.629-0.629,0.875c-0.278,0.247-0.618,0.441-1.02,0.583s-0.867,0.212-1.394,0.212			c-0.601,0-1.145-0.098-1.632-0.293s-0.901-0.446-1.241-0.752l0.357-0.578c0.045-0.074,0.099-0.131,0.162-0.17			c0.062-0.04,0.145-0.06,0.247-0.06s0.209,0.039,0.323,0.119c0.113,0.079,0.25,0.167,0.412,0.263			c0.162,0.097,0.357,0.185,0.586,0.264c0.229,0.08,0.517,0.119,0.863,0.119c0.294,0,0.552-0.038,0.773-0.114			c0.221-0.077,0.405-0.18,0.553-0.311c0.147-0.13,0.256-0.28,0.327-0.45c0.071-0.17,0.106-0.352,0.106-0.544			c0-0.238-0.063-0.436-0.191-0.591c-0.127-0.156-0.296-0.289-0.506-0.399c-0.21-0.111-0.449-0.207-0.718-0.289			s-0.544-0.169-0.825-0.26c-0.28-0.091-0.555-0.194-0.824-0.311c-0.27-0.115-0.509-0.262-0.718-0.438			c-0.21-0.176-0.378-0.393-0.506-0.65s-0.191-0.57-0.191-0.938c0-0.329,0.068-0.645,0.204-0.948			c0.136-0.303,0.334-0.569,0.595-0.799c0.26-0.229,0.581-0.412,0.96-0.549c0.379-0.136,0.813-0.203,1.3-0.203			c0.567,0,1.075,0.089,1.526,0.268s0.84,0.424,1.169,0.735L142.669,48.093z"/></g>	<g class="st50">		<path class="st52" d="M102.019,55.463c-0.08,0.198-0.197,0.346-0.353,0.441c-0.156,0.097-0.316,0.145-0.48,0.145h-0.638			l5.108-12.725c0.074-0.181,0.179-0.319,0.314-0.416c0.136-0.097,0.298-0.145,0.485-0.145h0.637L102.019,55.463z"/></g>	<g>		<circle class="st0" cx="23.379" cy="51.013" r="23.379"/><linearGradient id="SVGID_56_" gradientUnits="userSpaceOnUse" x1="-427.9141" y1="3329.9524" x2="-436.1267" y2="3369.842" gradientTransform="matrix(1 0 0 -1 464 3420)">			<stop  offset="0" style="stop-color:#EF4B52"/><stop  offset="0.1648" style="stop-color:#EB4950"/><stop  offset="0.336" style="stop-color:#DE444A"/><stop  offset="0.5103" style="stop-color:#CA3B3F"/><stop  offset="0.6867" style="stop-color:#AC2F30"/><stop  offset="0.8629" style="stop-color:#871F1D"/><stop  offset="1" style="stop-color:#65110C"/></linearGradient>		<polygon class="st95" points="35.297,56.83 28.538,48.859 23.34,57.525 		"/><polygon class="st96" points="28.538,48.859 34.085,45.22 35.297,56.83 		"/><linearGradient id="SVGID_57_" gradientUnits="userSpaceOnUse" x1="-411.8044" y1="3361.5105" x2="-431.9304" y2="3372.3027" gradientTransform="matrix(1 0 0 -1 464 3420)">			<stop  offset="0" style="stop-color:#EF4B52"/><stop  offset="0.1648" style="stop-color:#EB4950"/><stop  offset="0.336" style="stop-color:#DE444A"/><stop  offset="0.5103" style="stop-color:#CA3B3F"/><stop  offset="0.6867" style="stop-color:#AC2F30"/><stop  offset="0.8629" style="stop-color:#871F1D"/><stop  offset="1" style="stop-color:#65110C"/></linearGradient>		<polygon class="st97" points="35.426,56.83 41.208,48.859 34.34,41.582 34.34,45.22 		"/><polygon class="st98" points="11.384,56.83 18.142,48.859 23.34,57.525 		"/><polygon class="st96" points="18.142,48.859 12.598,45.22 11.384,56.83 		"/><polygon class="st96" points="18.142,48.859 12.598,45.22 11.384,56.83 		"/><linearGradient id="SVGID_58_" gradientUnits="userSpaceOnUse" x1="-453.7573" y1="3364.2542" x2="-450.3317" y2="3370.0708" gradientTransform="matrix(1 0 0 -1 464 3420)">			<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>		<polygon class="st99" points="18.142,48.859 12.598,45.22 11.384,56.83 		"/><polygon class="st100" points="11.361,56.136 5.629,48.859 12.548,41.582 12.548,45.22 		"/><linearGradient id="SVGID_59_" gradientUnits="userSpaceOnUse" x1="-445.2039" y1="3375.1318" x2="-455.2314" y2="3369.2825" gradientTransform="matrix(1 0 0 -1 464 3420)">			<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>		<polygon class="st101" points="11.361,56.136 5.629,48.859 12.548,41.582 12.548,45.22 		"/><linearGradient id="SVGID_60_" gradientUnits="userSpaceOnUse" x1="-458.4343" y1="3367.5164" x2="-442.2754" y2="3376.6838" gradientTransform="matrix(1 0 0 -1 464 3420)">			<stop  offset="0" style="stop-color:#62110B"/><stop  offset="0.172" style="stop-color:#66110D;stop-opacity:0.828"/><stop  offset="0.3508" style="stop-color:#731213;stop-opacity:0.6492"/><stop  offset="0.5327" style="stop-color:#87141D;stop-opacity:0.4673"/><stop  offset="0.7167" style="stop-color:#A5162B;stop-opacity:0.2833"/><stop  offset="0.9007" style="stop-color:#CA193D;stop-opacity:0.0993"/><stop  offset="1" style="stop-color:#E11B48;stop-opacity:0"/></linearGradient>		<polygon class="st102" points="11.361,56.136 5.629,48.859 12.548,41.582 12.548,45.22 		"/><linearGradient id="SVGID_61_" gradientUnits="userSpaceOnUse" x1="-444.8861" y1="3371.3726" x2="-438.9265" y2="3367.4431" gradientTransform="matrix(1 0 0 -1 464 3420)">			<stop  offset="0" style="stop-color:#EE393F"/><stop  offset="1" style="stop-color:#AC2024"/></linearGradient>		<polygon class="st103" points="23.34,48.796 18.142,48.796 18.142,48.796 23.34,57.459 28.538,48.796 28.538,48.796 		"/><linearGradient id="SVGID_62_" gradientUnits="userSpaceOnUse" x1="-447.1527" y1="3362.9087" x2="-438.485" y2="3371.7327" gradientTransform="matrix(1 0 0 -1 464 3420)">			<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0.42"/></linearGradient>		<polygon class="st104" points="23.34,48.796 18.142,48.796 18.142,48.796 23.34,57.459 28.538,48.796 28.538,48.796 		"/><polygon class="st105" points="29.32,38.89 23.34,38.89 17.363,38.89 12.548,41.582 12.548,45.22 18.142,48.796 23.34,48.796 			28.538,48.796 34.34,45.22 34.34,41.582 		"/><linearGradient id="SVGID_63_" gradientUnits="userSpaceOnUse" x1="-425.9631" y1="3394.0833" x2="-442.0651" y2="3374.791" gradientTransform="matrix(1 0 0 -1 464 3420)">			<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>		<polygon class="st106" points="29.32,38.89 23.34,38.89 17.363,38.89 12.548,41.582 12.548,45.22 18.142,48.796 23.34,48.796 			28.538,48.796 34.34,45.22 34.34,41.582 		"/><polygon class="st107" points="23.446,57.521 23.446,65.652 35.376,56.83 		"/><linearGradient id="SVGID_64_" gradientUnits="userSpaceOnUse" x1="-419.4159" y1="3346.9353" x2="-450.71" y2="3363.7161" gradientTransform="matrix(1 0 0 -1 464 3420)">			<stop  offset="0" style="stop-color:#EF4B52"/><stop  offset="0.1648" style="stop-color:#EB4950"/><stop  offset="0.336" style="stop-color:#DE444A"/><stop  offset="0.5103" style="stop-color:#CA3B3F"/><stop  offset="0.6867" style="stop-color:#AC2F30"/><stop  offset="0.8629" style="stop-color:#871F1D"/><stop  offset="1" style="stop-color:#65110C"/></linearGradient>		<polygon class="st108" points="23.446,57.711 23.34,57.711 11.384,56.923 23.381,65.714 23.446,65.652 		"/></g>	<g class="st50">		<path class="st0" d="M62.791,55.284v-8.61h0.867c0.165,0,0.278,0.031,0.34,0.094c0.062,0.062,0.104,0.17,0.127,0.322l0.102,1.344			c0.294-0.601,0.659-1.07,1.092-1.407c0.434-0.337,0.942-0.506,1.526-0.506c0.238,0,0.454,0.027,0.646,0.081			c0.193,0.054,0.371,0.129,0.536,0.226l-0.195,1.13c-0.04,0.142-0.128,0.213-0.264,0.213c-0.08,0-0.201-0.027-0.366-0.081			c-0.164-0.054-0.394-0.081-0.688-0.081c-0.527,0-0.968,0.153-1.322,0.459c-0.354,0.307-0.65,0.751-0.888,1.335v5.482H62.791z"/><path class="st0" d="M70.951,46.673v5.491c0,0.651,0.15,1.155,0.451,1.513s0.753,0.535,1.36,0.535c0.442,0,0.859-0.104,1.25-0.314			c0.391-0.209,0.751-0.501,1.08-0.875v-6.35h1.513v8.61h-0.901c-0.215,0-0.351-0.104-0.408-0.314l-0.119-0.927			c-0.374,0.414-0.793,0.747-1.258,0.999c-0.465,0.252-0.998,0.378-1.598,0.378c-0.47,0-0.885-0.078-1.245-0.233			c-0.36-0.156-0.662-0.375-0.905-0.659c-0.244-0.283-0.427-0.626-0.548-1.028c-0.122-0.402-0.183-0.847-0.183-1.334v-5.491H70.951z			"/><path class="st0" d="M79.145,55.284V42.763h1.521v5.151c0.357-0.414,0.766-0.747,1.229-0.999c0.461-0.252,0.99-0.378,1.585-0.378			c0.499,0,0.949,0.093,1.352,0.28c0.402,0.187,0.745,0.466,1.028,0.837c0.284,0.371,0.501,0.83,0.655,1.377			c0.153,0.547,0.229,1.178,0.229,1.892c0,0.635-0.085,1.226-0.255,1.772c-0.17,0.547-0.416,1.02-0.735,1.419			c-0.32,0.399-0.711,0.714-1.173,0.943s-0.981,0.345-1.56,0.345c-0.555,0-1.027-0.107-1.415-0.323			c-0.388-0.215-0.727-0.516-1.016-0.901l-0.076,0.782c-0.045,0.216-0.176,0.323-0.391,0.323H79.145z M82.987,47.745			c-0.493,0-0.925,0.113-1.296,0.34c-0.372,0.227-0.713,0.547-1.024,0.96v4.165c0.272,0.374,0.574,0.638,0.905,0.791			c0.332,0.152,0.701,0.229,1.109,0.229c0.805,0,1.422-0.286,1.853-0.858s0.646-1.389,0.646-2.448c0-0.562-0.05-1.043-0.149-1.445			s-0.242-0.732-0.429-0.99s-0.417-0.446-0.688-0.565S83.333,47.745,82.987,47.745z"/><path class="st0" d="M90.9,57.825c-0.051,0.114-0.115,0.204-0.191,0.272s-0.194,0.102-0.353,0.102h-1.122l1.572-3.417			l-3.553-8.108h1.309c0.13,0,0.232,0.032,0.306,0.098s0.127,0.138,0.162,0.217l2.304,5.423c0.051,0.125,0.095,0.249,0.131,0.374			c0.037,0.125,0.069,0.252,0.098,0.383c0.04-0.131,0.079-0.258,0.119-0.383s0.085-0.252,0.136-0.383l2.235-5.414			c0.034-0.091,0.092-0.166,0.174-0.226s0.171-0.089,0.268-0.089h1.207L90.9,57.825z"/></g>	<path class="st109" d="M300.079,68.014"/><line class="st110" x1="300.081" y1="83.809" x2="300.081" y2="86.555"/><path class="st111" d="M300.081,66.383v17.812c0,0,4.635-3.219,4.635-8.499C304.716,70.417,300.081,66.383,300.081,66.383z"/><path class="st112" d="M300.081,66.383v17.812c0,0-4.636-3.219-4.636-8.499C295.445,70.417,300.081,66.383,300.081,66.383z"/><g>		<g>			<line class="st113" x1="158.894" y1="49.583" x2="193.997" y2="49.583"/><g>				<circle class="st55" cx="193.902" cy="49.583" r="1.89"/></g>		</g>	</g></g><g id="watched-files" data-size="306x138" class="nanobox-svg ">	<g class="st50">		<path class="st114" d="M23.705,121.97c0.156,0.026,0.317,0.062,0.483,0.107s0.343,0.101,0.532,0.166			c0.072-0.144,0.167-0.252,0.288-0.327s0.272-0.112,0.454-0.112c0.319,0,0.543,0.08,0.674,0.239s0.199,0.447,0.205,0.864			l0.02,1.201v0.059c0,0.325-0.089,0.573-0.269,0.742s-0.441,0.254-0.786,0.254c-0.215,0-0.382-0.042-0.503-0.127			s-0.252-0.267-0.396-0.547c-0.169-0.332-0.402-0.586-0.698-0.762s-0.63-0.264-1.001-0.264c-0.534,0-0.951,0.112-1.25,0.337			s-0.449,0.532-0.449,0.923c0,0.3,0.088,0.542,0.264,0.728s0.58,0.405,1.211,0.659l1.816,0.693c0.898,0.358,1.533,0.77,1.904,1.235			c0.371,0.466,0.557,1.076,0.557,1.831c0,1.074-0.308,1.896-0.923,2.466s-1.505,0.854-2.671,0.854h-0.059l-0.127,2.139			c-0.02,0.293-0.104,0.506-0.254,0.64s-0.384,0.2-0.703,0.2c-0.267,0-0.46-0.062-0.581-0.186s-0.181-0.329-0.181-0.615v-0.156			l0.146-2.266c-0.221-0.039-0.443-0.096-0.664-0.171s-0.449-0.171-0.684-0.288c-0.098,0.13-0.207,0.223-0.327,0.278			s-0.298,0.083-0.532,0.083c-0.352,0-0.592-0.086-0.723-0.259s-0.195-0.486-0.195-0.942v-1.182c0-0.423,0.078-0.729,0.234-0.918			s0.404-0.283,0.742-0.283c0.508,0,0.863,0.273,1.064,0.82c0.052,0.137,0.091,0.237,0.117,0.303c0.143,0.306,0.42,0.552,0.83,0.737			s0.882,0.278,1.416,0.278c0.482,0,0.858-0.109,1.128-0.327s0.405-0.522,0.405-0.913c0-0.521-0.566-0.999-1.699-1.436l-0.059-0.02			l-1.797-0.703c-0.709-0.267-1.24-0.649-1.592-1.147s-0.527-1.108-0.527-1.831c0-0.977,0.285-1.73,0.854-2.261			s1.417-0.828,2.544-0.894l0.078-0.781c0.02-0.261,0.107-0.459,0.264-0.596s0.368-0.205,0.635-0.205			c0.273,0,0.485,0.061,0.635,0.181s0.225,0.291,0.225,0.513v0.127L23.705,121.97z"/></g>	<g class="st50">		<path class="st115" d="M50.707,131.57h0.127c0.365,0,0.638,0.09,0.82,0.269s0.273,0.447,0.273,0.806			c0,0.384-0.093,0.661-0.278,0.83s-0.5,0.254-0.942,0.254h-2.402c-0.436,0-0.75-0.085-0.942-0.254s-0.288-0.446-0.288-0.83			c0-0.358,0.093-0.627,0.278-0.806s0.464-0.269,0.835-0.269h0.117v-2.822c0-0.781-0.109-1.336-0.327-1.665			s-0.581-0.493-1.089-0.493c-0.541,0-0.981,0.197-1.323,0.591s-0.513,0.916-0.513,1.567v2.822h0.117c0.371,0,0.648,0.09,0.83,0.269			s0.273,0.447,0.273,0.806c0,0.384-0.094,0.661-0.283,0.83s-0.501,0.254-0.938,0.254H42.63c-0.436,0-0.749-0.085-0.938-0.254			s-0.283-0.446-0.283-0.83c0-0.358,0.091-0.627,0.273-0.806s0.459-0.269,0.83-0.269h0.117v-4.727h-0.166			c-0.352,0-0.619-0.09-0.801-0.269s-0.273-0.441-0.273-0.786c0-0.384,0.094-0.661,0.283-0.83s0.508-0.254,0.957-0.254h1.66			c0.182,0,0.321,0.036,0.415,0.107s0.142,0.176,0.142,0.312v0.762c0.299-0.469,0.682-0.822,1.147-1.06s1.004-0.356,1.616-0.356			c1.042,0,1.818,0.315,2.329,0.947s0.767,1.595,0.767,2.891V131.57z"/><path class="st115" d="M62.591,131.589h0.156c0.352,0,0.62,0.093,0.806,0.278s0.278,0.451,0.278,0.796			c0,0.378-0.096,0.649-0.288,0.815s-0.509,0.249-0.952,0.249h-0.918c-0.326,0-0.568-0.062-0.728-0.186s-0.292-0.349-0.396-0.674			c-0.541,0.358-1.113,0.632-1.719,0.82s-1.217,0.283-1.836,0.283c-1.048,0-1.872-0.261-2.471-0.781s-0.898-1.233-0.898-2.139			c0-0.977,0.387-1.735,1.162-2.275s1.862-0.811,3.262-0.811c0.312,0,0.645,0.017,0.996,0.049c0.352,0.032,0.746,0.085,1.182,0.156			v-0.186c0-0.586-0.142-1.032-0.425-1.338s-0.702-0.459-1.255-0.459c-0.43,0-0.978,0.159-1.646,0.479s-1.157,0.479-1.47,0.479			c-0.306,0-0.553-0.09-0.742-0.269s-0.283-0.415-0.283-0.708c0-0.527,0.386-0.945,1.157-1.255s1.821-0.464,3.149-0.464			c1.387,0,2.379,0.267,2.979,0.801s0.898,1.438,0.898,2.715V131.589z M60.228,129.704c-0.326-0.071-0.625-0.125-0.898-0.161			s-0.527-0.054-0.762-0.054c-0.716,0-1.278,0.12-1.685,0.361s-0.61,0.573-0.61,0.996c0,0.378,0.13,0.666,0.391,0.864			s0.635,0.298,1.123,0.298c0.449,0,0.873-0.065,1.27-0.195s0.788-0.332,1.172-0.605V129.704z"/><path class="st115" d="M74.711,131.57h0.127c0.365,0,0.638,0.09,0.82,0.269s0.273,0.447,0.273,0.806			c0,0.384-0.093,0.661-0.278,0.83s-0.5,0.254-0.942,0.254h-2.402c-0.436,0-0.75-0.085-0.942-0.254s-0.288-0.446-0.288-0.83			c0-0.358,0.093-0.627,0.278-0.806s0.464-0.269,0.835-0.269h0.117v-2.822c0-0.781-0.109-1.336-0.327-1.665			s-0.581-0.493-1.089-0.493c-0.541,0-0.981,0.197-1.323,0.591s-0.513,0.916-0.513,1.567v2.822h0.117c0.371,0,0.648,0.09,0.83,0.269			s0.273,0.447,0.273,0.806c0,0.384-0.094,0.661-0.283,0.83s-0.501,0.254-0.938,0.254h-2.422c-0.436,0-0.749-0.085-0.938-0.254			s-0.283-0.446-0.283-0.83c0-0.358,0.091-0.627,0.273-0.806s0.459-0.269,0.83-0.269h0.117v-4.727h-0.166			c-0.352,0-0.619-0.09-0.801-0.269s-0.273-0.441-0.273-0.786c0-0.384,0.094-0.661,0.283-0.83s0.508-0.254,0.957-0.254h1.66			c0.182,0,0.321,0.036,0.415,0.107s0.142,0.176,0.142,0.312v0.762c0.299-0.469,0.682-0.822,1.147-1.06s1.004-0.356,1.616-0.356			c1.042,0,1.818,0.315,2.329,0.947s0.767,1.595,0.767,2.891V131.57z"/><path class="st115" d="M82.611,124.49c1.582,0,2.865,0.442,3.848,1.328s1.475,2.021,1.475,3.408c0,1.394-0.492,2.532-1.475,3.418			s-2.266,1.328-3.848,1.328c-1.576,0-2.855-0.442-3.838-1.328s-1.475-2.024-1.475-3.418c0-1.387,0.493-2.522,1.479-3.408			S81.042,124.49,82.611,124.49z M82.611,126.55c-0.762,0-1.388,0.249-1.88,0.747s-0.737,1.135-0.737,1.909			c0,0.781,0.246,1.428,0.737,1.938s1.118,0.767,1.88,0.767s1.39-0.256,1.885-0.767s0.742-1.157,0.742-1.938			c0-0.774-0.246-1.411-0.737-1.909S83.379,126.55,82.611,126.55z"/><path class="st115" d="M92.855,125.583c0.312-0.273,0.684-0.488,1.113-0.645s0.879-0.234,1.348-0.234			c1.354,0,2.462,0.447,3.325,1.343s1.294,2.043,1.294,3.442c0,1.276-0.439,2.342-1.318,3.198s-1.986,1.284-3.32,1.284			c-0.631,0-1.18-0.109-1.646-0.327s-0.845-0.545-1.138-0.981v0.645c0,0.13-0.05,0.232-0.151,0.308s-0.243,0.112-0.425,0.112h-1.504			c-0.443,0-0.757-0.083-0.942-0.249s-0.278-0.444-0.278-0.835c0-0.345,0.089-0.607,0.269-0.786s0.444-0.269,0.796-0.269h0.156			v-8.477h-0.156c-0.352,0-0.62-0.093-0.806-0.278s-0.278-0.454-0.278-0.806c0-0.384,0.094-0.661,0.283-0.83			s0.508-0.254,0.957-0.254h1.826c0.208,0,0.36,0.051,0.454,0.151s0.142,0.266,0.142,0.493V125.583z M95.013,126.785			c-0.638,0-1.167,0.239-1.587,0.718s-0.63,1.086-0.63,1.821c0,0.755,0.208,1.372,0.625,1.851s0.947,0.718,1.592,0.718			s1.177-0.241,1.597-0.723s0.63-1.097,0.63-1.846c0-0.729-0.211-1.335-0.635-1.816S95.651,126.785,95.013,126.785z"/><path class="st115" d="M106.615,124.49c1.582,0,2.865,0.442,3.848,1.328s1.475,2.021,1.475,3.408c0,1.394-0.492,2.532-1.475,3.418			s-2.266,1.328-3.848,1.328c-1.576,0-2.855-0.442-3.838-1.328s-1.475-2.024-1.475-3.418c0-1.387,0.493-2.522,1.479-3.408			S105.046,124.49,106.615,124.49z M106.615,126.55c-0.762,0-1.388,0.249-1.88,0.747s-0.737,1.135-0.737,1.909			c0,0.781,0.246,1.428,0.737,1.938s1.118,0.767,1.88,0.767s1.39-0.256,1.885-0.767s0.742-1.157,0.742-1.938			c0-0.774-0.246-1.411-0.737-1.909S107.383,126.55,106.615,126.55z"/><path class="st115" d="M117.621,126.667l1.035,1.221l1.123-1.221c-0.215,0-0.371-0.076-0.469-0.229s-0.146-0.396-0.146-0.728			c0-0.325,0.083-0.574,0.249-0.747s0.409-0.259,0.728-0.259h2.08c0.436,0,0.749,0.085,0.938,0.254s0.283,0.446,0.283,0.83			c0,0.358-0.093,0.623-0.278,0.796s-0.474,0.259-0.864,0.259h-0.381l-2.041,2.227l2.441,2.5h0.225c0.377,0,0.663,0.09,0.854,0.269			s0.288,0.447,0.288,0.806c0,0.384-0.099,0.661-0.298,0.83s-0.519,0.254-0.962,0.254h-2.363c-0.319,0-0.562-0.086-0.728-0.259			s-0.249-0.418-0.249-0.737c0-0.339,0.05-0.584,0.151-0.737s0.262-0.229,0.483-0.229h0.078l-1.24-1.377l-1.201,1.377h0.039			c0.234,0,0.404,0.073,0.508,0.22s0.156,0.373,0.156,0.679c0,0.364-0.08,0.633-0.239,0.806s-0.405,0.259-0.737,0.259h-2.08			c-0.443,0-0.757-0.085-0.942-0.254s-0.278-0.446-0.278-0.83c0-0.358,0.089-0.627,0.269-0.806s0.448-0.269,0.806-0.269h0.186			l2.314-2.344l-2.236-2.383h-0.303c-0.384,0-0.674-0.088-0.869-0.264s-0.293-0.439-0.293-0.791c0-0.384,0.098-0.661,0.293-0.83			s0.511-0.254,0.947-0.254h2.363c0.332,0,0.578,0.088,0.737,0.264s0.239,0.442,0.239,0.801c0,0.3-0.05,0.524-0.151,0.674			S117.829,126.667,117.621,126.667z"/><path class="st115" d="M144.164,126.843h-0.156c-0.352,0-0.617-0.091-0.796-0.273s-0.269-0.449-0.269-0.801			c0-0.384,0.091-0.657,0.273-0.82s0.498-0.244,0.947-0.244h1.846c0.176,0,0.312,0.037,0.41,0.112s0.146,0.178,0.146,0.308v6.465			h0.156c0.352,0,0.62,0.091,0.806,0.273s0.278,0.442,0.278,0.781c0,0.391-0.095,0.669-0.283,0.835s-0.508,0.249-0.957,0.249h-1.641			c-0.183,0-0.324-0.039-0.425-0.117s-0.151-0.186-0.151-0.322v-0.742c-0.312,0.469-0.695,0.82-1.147,1.055			s-0.984,0.352-1.597,0.352c-1.048,0-1.826-0.315-2.334-0.947s-0.762-1.599-0.762-2.9v-3.262h-0.166			c-0.352,0-0.619-0.091-0.801-0.273s-0.273-0.449-0.273-0.801c0-0.384,0.093-0.657,0.278-0.82s0.506-0.244,0.962-0.244h1.836			c0.176,0,0.31,0.037,0.4,0.112s0.137,0.178,0.137,0.308v4.541c0,0.801,0.11,1.364,0.332,1.689s0.586,0.488,1.094,0.488			c0.54,0,0.984-0.2,1.333-0.601s0.522-0.926,0.522-1.577V126.843z"/><path class="st115" d="M152.767,132.81v2.656h1.24c0.442,0,0.76,0.085,0.952,0.254s0.288,0.446,0.288,0.83			c0,0.378-0.095,0.647-0.283,0.811s-0.508,0.244-0.957,0.244h-4.141c-0.449,0-0.765-0.08-0.947-0.239s-0.273-0.432-0.273-0.815			s0.093-0.661,0.278-0.83s0.5-0.254,0.942-0.254h0.576v-8.623h-0.156c-0.345,0-0.608-0.091-0.791-0.273s-0.273-0.449-0.273-0.801			c0-0.384,0.091-0.657,0.273-0.82s0.498-0.244,0.947-0.244h1.504c0.188,0,0.329,0.034,0.42,0.103s0.137,0.168,0.137,0.298v0.703			c0.332-0.442,0.734-0.776,1.206-1.001s1.004-0.337,1.597-0.337c1.335,0,2.441,0.427,3.32,1.279s1.318,1.927,1.318,3.223			c0,1.354-0.427,2.476-1.279,3.364s-1.927,1.333-3.223,1.333c-0.527,0-1.021-0.073-1.479-0.22S153.106,133.09,152.767,132.81z			 M155.023,126.55c-0.645,0-1.175,0.237-1.592,0.713s-0.625,1.084-0.625,1.826s0.208,1.351,0.625,1.826s0.947,0.713,1.592,0.713			s1.177-0.239,1.597-0.718s0.63-1.086,0.63-1.821c0-0.742-0.208-1.351-0.625-1.826S155.674,126.55,155.023,126.55z"/><path class="st115" d="M174.554,128.113h8.096c0.156,0,0.275,0.039,0.356,0.117s0.122,0.192,0.122,0.342v1.221			c0,0.137-0.051,0.261-0.151,0.371s-0.21,0.166-0.327,0.166h-8.096c-0.13,0-0.232-0.049-0.308-0.146s-0.112-0.228-0.112-0.391			v-1.221c0-0.137,0.039-0.247,0.117-0.332S174.43,128.113,174.554,128.113z"/><path class="st115" d="M186.556,128.113h8.096c0.156,0,0.275,0.039,0.356,0.117s0.122,0.192,0.122,0.342v1.221			c0,0.137-0.051,0.261-0.151,0.371s-0.21,0.166-0.327,0.166h-8.096c-0.13,0-0.232-0.049-0.308-0.146s-0.112-0.228-0.112-0.391			v-1.221c0-0.137,0.039-0.247,0.117-0.332S186.432,128.113,186.556,128.113z"/><path class="st115" d="M199.632,126.843l0.781,4.805l1.045-3.721c0.11-0.391,0.251-0.647,0.42-0.771s0.42-0.186,0.752-0.186			s0.583,0.059,0.752,0.176s0.312,0.378,0.43,0.781l1.084,3.721l0.742-4.805h-0.166c-0.352,0-0.618-0.091-0.801-0.273			s-0.273-0.449-0.273-0.801c0-0.384,0.093-0.657,0.278-0.82s0.506-0.244,0.962-0.244h2.295c0.449,0,0.769,0.083,0.957,0.249			s0.283,0.438,0.283,0.815c0,0.352-0.093,0.618-0.278,0.801s-0.451,0.273-0.796,0.273h-0.166l-1.221,6.162			c-0.065,0.339-0.215,0.584-0.449,0.737s-0.576,0.229-1.025,0.229c-0.442,0-0.781-0.076-1.016-0.229s-0.403-0.398-0.508-0.737			l-1.143-3.799l-1.016,3.799c-0.085,0.325-0.254,0.568-0.508,0.728s-0.599,0.239-1.035,0.239c-0.449,0-0.788-0.076-1.016-0.229			s-0.374-0.398-0.439-0.737l-1.24-6.162h-0.166c-0.345,0-0.607-0.091-0.786-0.273s-0.269-0.449-0.269-0.801			c0-0.378,0.091-0.649,0.273-0.815s0.498-0.249,0.947-0.249h2.314c0.449,0,0.765,0.083,0.947,0.249s0.273,0.438,0.273,0.815			c0,0.352-0.09,0.618-0.269,0.801s-0.441,0.273-0.786,0.273H199.632z"/><path class="st115" d="M218.617,131.589h0.156c0.352,0,0.62,0.093,0.806,0.278s0.278,0.451,0.278,0.796			c0,0.378-0.096,0.649-0.288,0.815s-0.51,0.249-0.952,0.249h-0.918c-0.325,0-0.568-0.062-0.728-0.186s-0.291-0.349-0.396-0.674			c-0.54,0.358-1.113,0.632-1.719,0.82s-1.218,0.283-1.836,0.283c-1.048,0-1.872-0.261-2.471-0.781s-0.898-1.233-0.898-2.139			c0-0.977,0.388-1.735,1.162-2.275s1.862-0.811,3.262-0.811c0.312,0,0.645,0.017,0.996,0.049c0.352,0.032,0.745,0.085,1.182,0.156			v-0.186c0-0.586-0.142-1.032-0.425-1.338s-0.701-0.459-1.255-0.459c-0.43,0-0.979,0.159-1.646,0.479s-1.157,0.479-1.47,0.479			c-0.306,0-0.554-0.09-0.742-0.269s-0.283-0.415-0.283-0.708c0-0.527,0.386-0.945,1.157-1.255s1.821-0.464,3.149-0.464			c1.387,0,2.38,0.267,2.979,0.801s0.898,1.438,0.898,2.715V131.589z M216.254,129.704c-0.325-0.071-0.625-0.125-0.898-0.161			s-0.527-0.054-0.762-0.054c-0.716,0-1.277,0.12-1.685,0.361s-0.61,0.573-0.61,0.996c0,0.378,0.13,0.666,0.391,0.864			s0.635,0.298,1.123,0.298c0.449,0,0.872-0.065,1.27-0.195s0.788-0.332,1.172-0.605V129.704z"/><path class="st115" d="M225.961,125.251h2.979c0.449,0,0.769,0.081,0.957,0.244s0.283,0.433,0.283,0.811			c0,0.384-0.096,0.661-0.288,0.83s-0.51,0.254-0.952,0.254h-2.979v2.5c0,0.703,0.107,1.185,0.322,1.445s0.593,0.391,1.133,0.391			c0.508,0,1.106-0.146,1.797-0.439s1.152-0.439,1.387-0.439c0.267,0,0.496,0.105,0.688,0.317s0.288,0.467,0.288,0.767			c0,0.501-0.454,0.959-1.362,1.372s-1.938,0.62-3.091,0.62c-0.671,0-1.26-0.091-1.768-0.273s-0.908-0.442-1.201-0.781			c-0.215-0.261-0.368-0.573-0.459-0.938s-0.137-0.974-0.137-1.826v-0.215v-2.5h-0.918c-0.442,0-0.757-0.085-0.942-0.254			s-0.278-0.446-0.278-0.83s0.091-0.656,0.273-0.815s0.498-0.239,0.947-0.239h0.918v-2.285c0-0.449,0.093-0.765,0.278-0.947			s0.493-0.273,0.923-0.273s0.737,0.091,0.923,0.273s0.278,0.498,0.278,0.947V125.251z"/><path class="st115" d="M241.537,125.232c0.078-0.254,0.2-0.444,0.366-0.571s0.379-0.19,0.64-0.19c0.352,0,0.603,0.105,0.752,0.317			s0.225,0.578,0.225,1.099v1.602c0,0.397-0.081,0.69-0.244,0.879s-0.413,0.283-0.752,0.283c-0.241,0-0.442-0.056-0.605-0.166			s-0.335-0.322-0.518-0.635c-0.261-0.442-0.603-0.77-1.025-0.981s-0.94-0.317-1.553-0.317c-0.762,0-1.385,0.249-1.87,0.747			s-0.728,1.135-0.728,1.909c0,0.813,0.251,1.468,0.752,1.963s1.175,0.742,2.021,0.742c0.769,0,1.531-0.213,2.29-0.64			s1.223-0.64,1.392-0.64c0.241,0,0.441,0.093,0.601,0.278s0.239,0.418,0.239,0.698c0,0.612-0.464,1.159-1.392,1.641			s-2.029,0.723-3.306,0.723c-1.575,0-2.856-0.442-3.843-1.328s-1.479-2.024-1.479-3.418c0-1.36,0.488-2.493,1.465-3.398			s2.207-1.357,3.691-1.357c0.501,0,0.989,0.062,1.465,0.186S241.068,124.971,241.537,125.232z"/><path class="st115" d="M249.066,125.691c0.228-0.397,0.55-0.7,0.967-0.908s0.915-0.312,1.494-0.312c1.028,0,1.821,0.3,2.378,0.898			s0.835,1.458,0.835,2.578v3.643h0.166c0.345,0,0.607,0.09,0.786,0.269s0.269,0.441,0.269,0.786c0,0.384-0.093,0.661-0.278,0.83			s-0.5,0.254-0.942,0.254h-2.422c-0.437,0-0.747-0.085-0.933-0.254s-0.278-0.446-0.278-0.83c0-0.352,0.088-0.615,0.264-0.791			s0.439-0.264,0.791-0.264h0.156v-2.842c0-0.833-0.103-1.411-0.308-1.733s-0.555-0.483-1.05-0.483c-0.521,0-0.967,0.21-1.338,0.63			s-0.557,0.949-0.557,1.587v2.842h0.156c0.352,0,0.617,0.09,0.796,0.269s0.269,0.441,0.269,0.786c0,0.384-0.095,0.661-0.283,0.83			s-0.501,0.254-0.938,0.254h-2.422c-0.449,0-0.765-0.083-0.947-0.249s-0.273-0.444-0.273-0.835c0-0.345,0.09-0.607,0.269-0.786			s0.441-0.269,0.786-0.269h0.166v-8.477h-0.166c-0.345,0-0.61-0.093-0.796-0.278s-0.278-0.454-0.278-0.806			c0-0.384,0.095-0.661,0.283-0.83s0.508-0.254,0.957-0.254h1.836c0.222,0,0.374,0.046,0.459,0.137s0.127,0.261,0.127,0.508V125.691			z"/></g>	<g>		<polygon class="st15" points="305.249,56.153 233.697,93.032 162.144,56.153 233.697,19.271 		"/><polygon class="st15" points="290.661,56.151 233.697,85.512 176.73,56.151 233.697,26.787 		"/><polygon class="st16" points="193.58,50.154 179.341,57.486 176.802,56.151 191.044,48.819 		"/><polygon class="st16" points="208.816,46.959 188.777,57.289 186.239,55.95 206.279,45.621 		"/><polygon class="st16" points="213.344,49.293 193.305,59.622 190.768,58.284 210.807,47.955 		"/><polygon class="st16" points="217.872,51.625 197.833,61.956 195.294,60.618 215.334,50.287 		"/><polygon class="st16" points="214.251,60.819 200.009,68.151 197.472,66.815 211.714,59.482 		"/><polygon class="st16" points="229.488,57.621 209.447,67.953 206.909,66.614 226.949,56.284 		"/><polygon class="st16" points="234.015,59.955 213.975,70.284 211.436,68.948 231.477,58.618 		"/><polygon class="st16" points="238.542,62.289 218.503,72.618 215.962,71.282 236.003,60.953 		"/><polygon class="st16" points="234.205,71.102 219.962,78.432 217.425,77.098 231.667,69.766 		"/><polygon class="st16" points="249.44,67.904 229.401,78.236 226.862,76.899 246.903,66.569 		"/><polygon class="st16" points="253.968,70.239 233.928,80.569 231.388,79.231 251.429,68.903 		"/><polygon class="st16" points="258.495,72.573 238.454,82.903 235.915,81.565 255.957,71.236 		"/><polygon class="st16" points="225.577,33.823 211.335,41.154 208.798,39.817 223.038,32.486 		"/><polygon class="st16" points="240.813,30.623 220.772,40.956 218.235,39.618 238.275,29.287 		"/><polygon class="st16" points="245.34,32.957 225.3,43.289 222.762,41.95 242.802,31.621 		"/><polygon class="st16" points="249.868,35.291 229.826,45.621 227.287,44.287 247.331,33.955 		"/><polygon class="st16" points="246.245,44.486 232.006,51.817 229.467,50.481 243.708,43.151 		"/><polygon class="st16" points="261.483,41.289 241.442,51.618 238.904,50.282 258.945,39.95 		"/><polygon class="st16" points="266.01,43.623 245.969,53.953 243.431,52.616 263.471,42.284 		"/><polygon class="st16" points="270.537,45.955 250.496,56.284 247.958,54.95 267.999,44.618 		"/><polygon class="st16" points="266.198,54.768 251.958,62.098 249.419,60.764 263.661,53.432 		"/><polygon class="st16" points="281.436,51.573 261.394,61.903 258.857,60.567 278.897,50.236 		"/><polygon class="st16" points="285.964,53.904 265.921,64.236 263.384,62.899 283.423,52.57 		"/><polygon class="st16" points="290.489,56.239 270.45,66.569 267.911,65.232 287.952,54.901 		"/><polygon class="st17" points="233.697,93.032 305.249,56.153 305.249,59.149 233.697,96.027 		"/><polygon class="st18" points="233.697,93.032 162.144,56.153 162.144,59.149 233.697,96.027 		"/></g>	<polyline class="st116" points="209.276,33.277 177.889,16.733 140.56,36.819 	"/><polyline class="st116" points="217.356,29.475 177.889,8.625 140.56,28.711 	"/><polyline class="st116" points="225.653,25.621 178.044,0.469 140.56,20.606 	"/><polyline class="st117" points="127.364,32.797 72.804,61.852 35.283,42.075 	"/><polygon class="st30" points="36.133,46.124 34.867,44.012 38.93,44.539 	"/><polyline class="st117" points="127.364,40.904 72.804,69.958 37.231,50.936 	"/><polyline class="st117" points="108.513,35.051 72.804,53.746 63.932,48.416 	"/><polygon class="st52" points="63.195,49.461 61.928,47.348 65.992,47.876 	"/><polygon class="st52" points="147.106,18.534 125.706,29.771 103.671,18.409 125.084,7.186 	"/><polygon class="st118" points="147.106,35.963 147.106,18.537 125.706,29.771 125.705,46.646 	"/><polygon class="st119" points="125.706,29.771 103.671,18.409 103.671,35.379 125.705,46.646 	"/><polygon class="st91" points="144.223,20.092 142.709,20.856 120.673,9.493 122.202,8.741 	"/><polygon class="st91" points="142.709,20.856 144.223,20.092 144.223,37.235 142.709,37.998 	"/><polygon class="st91" points="139.14,22.759 137.626,23.524 115.591,12.162 117.118,11.409 	"/><polygon class="st91" points="137.626,23.524 139.14,22.759 139.14,39.904 137.626,40.666 	"/><polygon class="st91" points="133.344,25.762 131.829,26.524 109.794,15.164 111.321,14.409 	"/><polygon class="st91" points="131.829,26.524 133.344,25.762 133.344,42.904 131.829,43.668 	"/><polygon class="st60" points="67.942,21.957 22.656,45.748 0,34.069 45.3,10.284 	"/><polygon class="st61" points="67.942,39.875 67.942,21.957 22.656,45.748 22.655,63.1 	"/><polygon class="st62" points="22.656,45.748 0,34.069 0,51.516 22.655,63.1 	"/><polygon class="st15" points="44.66,34.147 42.09,35.483 19.434,23.801 22.017,22.479 	"/><polygon class="st18" points="42.09,35.483 44.66,34.147 44.66,51.774 42.09,53.11 	"/><polygon class="st15" points="51.84,30.654 49.271,31.989 26.615,20.309 29.197,18.986 	"/><polygon class="st18" points="49.271,31.989 51.84,30.654 51.84,48.279 49.271,49.616 	"/><polygon class="st15" points="37.95,37.809 35.382,39.142 12.726,27.461 15.308,26.139 	"/><polygon class="st18" points="35.382,39.142 37.95,37.809 37.95,55.434 35.382,56.768 	"/></g><g id="logo" data-size="124x78" class="nanobox-svg ">	<path class="st120" d="M1.632,61.564l8.924,13.027h0.043V61.564h1.459v15.4h-1.631L1.503,63.936H1.46v13.028H0v-15.4H1.632		L1.632,61.564z"/><path class="st120" d="M25.1,61.564l6.021,15.4h-1.566l-1.864-4.789h-6.974l-1.846,4.789h-1.549l6.146-15.4H25.1L25.1,61.564z		 M27.181,70.925l-2.959-7.896l-3.062,7.896H27.181z"/><path class="st120" d="M37.974,61.564l8.938,13.027h0.043V61.564h1.459v15.4h-1.646l-8.925-13.028H37.8v13.028h-1.461v-15.4H37.974		L37.974,61.564z"/><path class="st120" d="M54.963,66.222c0.299-0.963,0.75-1.814,1.354-2.555c0.604-0.741,1.354-1.33,2.268-1.771		c0.906-0.438,1.965-0.659,3.16-0.659c1.203,0,2.258,0.229,3.156,0.659c0.896,0.438,1.646,1.027,2.25,1.771		c0.604,0.729,1.053,1.592,1.354,2.555c0.301,0.964,0.448,1.979,0.448,3.042c0,1.064-0.147,2.078-0.448,3.041		c-0.302,0.964-0.75,1.812-1.354,2.546c-0.604,0.733-1.354,1.319-2.25,1.758c-0.898,0.438-1.953,0.657-3.156,0.657		c-1.195,0-2.254-0.219-3.16-0.657s-1.66-1.021-2.268-1.758c-0.604-0.73-1.062-1.582-1.354-2.546		c-0.301-0.963-0.451-1.977-0.451-3.041C54.512,68.2,54.664,67.186,54.963,66.222z M56.303,71.734		c0.229,0.812,0.566,1.539,1.031,2.188c0.463,0.64,1.062,1.146,1.789,1.542c0.729,0.388,1.604,0.582,2.613,0.582		c1.021,0,1.889-0.194,2.604-0.582c0.729-0.396,1.312-0.902,1.778-1.542c0.468-0.646,0.81-1.366,1.028-2.188		c0.222-0.812,0.332-1.636,0.332-2.47c0-0.849-0.11-1.675-0.332-2.479c-0.229-0.812-0.562-1.528-1.028-2.188		c-0.466-0.64-1.06-1.146-1.778-1.541c-0.724-0.39-1.59-0.58-2.604-0.58c-1.021,0-1.896,0.19-2.613,0.58		c-0.73,0.396-1.326,0.901-1.789,1.541c-0.465,0.646-0.812,1.363-1.031,2.188c-0.221,0.806-0.332,1.632-0.332,2.479		C55.971,70.098,56.082,70.922,56.303,71.734z"/><path class="st120" d="M81.566,61.564c0.646,0,1.262,0.062,1.854,0.188c0.592,0.104,1.111,0.312,1.562,0.625		c0.451,0.295,0.812,0.684,1.084,1.146c0.271,0.482,0.404,1.082,0.404,1.812c0,0.396-0.062,0.795-0.191,1.176		c-0.127,0.382-0.312,0.729-0.547,1.036c-0.232,0.307-0.521,0.562-0.836,0.786c-0.319,0.216-0.688,0.354-1.084,0.452v0.045		c0.979,0.128,1.771,0.521,2.354,1.218c0.588,0.683,0.883,1.521,0.883,2.535c0,0.231-0.021,0.521-0.062,0.83		c-0.043,0.309-0.129,0.625-0.261,0.938c-0.146,0.323-0.312,0.646-0.562,0.979c-0.239,0.312-0.562,0.604-0.976,0.812		c-0.406,0.237-0.91,0.438-1.502,0.582c-0.604,0.151-1.312,0.229-2.146,0.229h-6.479V61.557L81.566,61.564L81.566,61.564z		 M81.566,68.315c0.588,0,1.094-0.062,1.521-0.205c0.428-0.137,0.784-0.318,1.068-0.56c0.285-0.238,0.502-0.521,0.646-0.832		c0.146-0.315,0.229-0.653,0.229-1.013c0-1.938-1.148-2.896-3.454-2.896h-5.021v5.5L81.566,68.315L81.566,68.315z M81.566,75.713		c0.545,0,1.062-0.047,1.545-0.146c0.479-0.093,0.914-0.262,1.285-0.507c0.375-0.244,0.668-0.564,0.881-0.979		c0.215-0.409,0.322-0.938,0.322-1.541c0-0.993-0.354-1.737-1.041-2.232c-0.693-0.496-1.691-0.745-2.992-0.745h-5.021v6.147		L81.566,75.713L81.566,75.713z"/><path class="st120" d="M92.891,66.222c0.312-0.963,0.752-1.814,1.355-2.555c0.6-0.741,1.354-1.33,2.264-1.771		c0.906-0.438,1.961-0.659,3.164-0.659c1.199,0,2.252,0.229,3.148,0.659c0.896,0.438,1.646,1.027,2.258,1.771		c0.6,0.729,1.051,1.592,1.35,2.555c0.301,0.964,0.451,1.979,0.451,3.042c0,1.064-0.15,2.078-0.451,3.041		c-0.299,0.964-0.75,1.812-1.35,2.546c-0.605,0.733-1.355,1.319-2.258,1.758c-0.896,0.439-1.949,0.657-3.148,0.657		c-1.203,0-2.258-0.219-3.164-0.657c-0.91-0.438-1.664-1.021-2.264-1.758c-0.605-0.73-1.055-1.582-1.355-2.546		c-0.301-0.963-0.438-1.977-0.438-3.041C92.443,68.2,92.59,67.186,92.891,66.222z M94.234,71.734		c0.225,0.812,0.562,1.539,1.021,2.188c0.465,0.64,1.062,1.146,1.793,1.542c0.729,0.388,1.604,0.582,2.616,0.582		s1.886-0.194,2.604-0.582c0.729-0.396,1.312-0.902,1.771-1.542c0.468-0.646,0.812-1.366,1.028-2.188		c0.227-0.812,0.332-1.636,0.332-2.47c0-0.849-0.105-1.675-0.332-2.479c-0.229-0.812-0.562-1.528-1.028-2.188		c-0.468-0.64-1.062-1.146-1.771-1.541c-0.729-0.39-1.604-0.58-2.604-0.58c-1.021,0-1.895,0.19-2.616,0.58		c-0.729,0.396-1.328,0.901-1.793,1.541c-0.465,0.646-0.812,1.363-1.021,2.188c-0.229,0.806-0.332,1.632-0.332,2.479		C93.902,70.098,94.012,70.922,94.234,71.734z"/><path class="st120" d="M113.252,61.564l4.332,6.45l4.48-6.45h1.629l-5.229,7.506l5.533,7.896h-1.762l-4.652-6.794l-4.723,6.794		h-1.631l5.479-7.938l-5.188-7.463L113.252,61.564L113.252,61.564z"/><polygon class="st121" points="59.803,40.473 78.779,30.639 78.779,33.506 59.803,43.341 	"/><polygon class="st19" points="59.803,40.473 40.829,30.639 40.829,33.506 59.803,43.341 	"/><polygon class="st121" points="59.803,33.626 78.779,23.793 78.779,26.66 59.803,36.494 	"/><polygon class="st19" points="59.803,33.626 40.829,23.793 40.829,26.66 59.803,36.494 	"/><polygon class="st121" points="59.803,26.781 78.779,16.949 78.779,19.814 59.803,29.649 	"/><polygon class="st19" points="59.803,26.781 40.829,16.949 40.829,19.814 59.803,29.649 	"/><polygon class="st122" points="78.779,10.101 59.803,19.934 40.379,9.835 59.353,0 	"/><polygon class="st121" points="59.803,19.934 78.779,10.101 78.779,12.968 59.803,22.803 	"/><polygon class="st19" points="59.803,19.941 40.32,9.732 40.32,12.684 59.803,22.895 	"/></g><g id="docker-containers" data-size="264x255" class="nanobox-svg ">	<polygon class="st19" points="263.493,153.582 133.297,220.692 0,152.374 130.198,85.272 	"/><polygon class="st20" points="151.641,168.682 105.705,192.818 82.726,180.966 128.672,156.846 	"/><polygon class="st21" points="82.726,180.821 128.672,156.692 128.672,172.615 97.873,188.782 	"/><polyline class="st22" points="128.672,156.692 128.672,172.615 136.441,176.668 151.641,168.682 	"/><polygon class="st20" points="122.491,153.575 76.547,177.709 53.569,165.864 99.522,141.737 	"/><polygon class="st21" points="53.569,165.708 99.522,141.583 99.522,157.502 68.725,173.67 	"/><polyline class="st22" points="99.522,141.583 99.522,157.502 107.289,161.555 122.491,153.575 	"/><polygon class="st20" points="93.337,138.312 47.397,162.444 24.419,150.599 70.367,126.472 	"/><polygon class="st21" points="24.419,150.449 70.367,126.32 70.367,142.241 39.571,158.411 	"/><polyline class="st22" points="70.367,126.32 70.367,142.241 78.133,146.294 93.337,138.312 	"/><polygon class="st22" points="133.297,220.865 263.493,153.757 263.493,187.032 133.297,254.14 	"/><polygon class="st21" points="133.297,220.865 0,152.374 0,185.653 133.297,254.14 	"/><polygon class="st20" points="240.323,152.676 216.315,165.394 193.338,153.551 217.353,140.842 	"/><polygon class="st21" points="193.338,153.399 217.353,140.688 217.353,156.605 208.485,161.361 	"/><polyline class="st22" points="217.353,140.688 217.353,156.605 225.123,160.661 240.323,152.676 	"/><polygon class="st20" points="211.713,137.576 165.778,161.708 142.799,149.859 188.75,125.738 	"/><polyline class="st22" points="188.75,125.586 188.75,141.506 196.518,145.561 211.713,137.576 	"/><polygon class="st21" points="142.799,149.706 188.75,125.586 188.75,141.497 157.946,157.662 	"/><polygon class="st20" points="182.014,122.309 136.077,146.438 113.099,134.591 159.049,110.47 	"/><polygon class="st21" points="113.099,134.445 159.049,110.32 159.049,126.24 128.254,142.401 	"/><polyline class="st22" points="159.049,110.32 159.049,126.24 166.821,130.295 182.014,122.309 	"/><polygon class="st20" points="152.866,107.045 106.928,131.179 83.946,119.332 129.898,95.206 	"/><polygon class="st21" points="84.237,119.235 130.002,95.206 130.002,111.057 99.329,127.161 	"/><polyline class="st22" points="130.002,95.206 130.002,111.057 137.736,115.101 152.875,107.147 	"/><g>		<polygon class="st20" points="157.395,195.5 133.387,208.218 110.411,196.369 134.43,183.66 		"/><polygon class="st21" points="110.411,196.219 134.43,183.508 134.43,199.425 125.56,204.183 		"/><polyline class="st22" points="134.43,183.508 134.43,199.425 142.196,203.485 157.395,195.5 		"/></g>	<g>		<polygon class="st20" points="199.901,173.325 175.893,186.045 152.916,174.198 176.934,161.489 		"/><polygon class="st21" points="152.916,174.05 176.934,161.337 176.934,177.254 168.066,182.009 		"/><polyline class="st22" points="176.934,161.337 176.934,177.254 184.702,181.313 199.901,173.325 		"/></g>	<g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_65_" points="199.901,173.546 175.89,186.265 152.914,174.419 176.93,161.71 												"/></defs>											<clipPath id="SVGID_66_">												<use xlink:href="#SVGID_65_"  style="overflow:visible;"/></clipPath>											<polygon class="st123" points="195.647,174.213 176.938,183.865 158.215,174.213 176.942,164.565 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_67_" points="199.901,173.546 175.89,186.265 152.914,174.419 176.93,161.71 												"/></defs>											<clipPath id="SVGID_68_">												<use xlink:href="#SVGID_67_"  style="overflow:visible;"/></clipPath>											<polygon class="st124" points="195.647,189.017 195.647,174.213 176.938,183.865 176.938,198.196 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_69_" points="199.901,173.546 175.89,186.265 152.914,174.419 176.93,161.71 												"/></defs>											<clipPath id="SVGID_70_">												<use xlink:href="#SVGID_69_"  style="overflow:visible;"/></clipPath>											<polygon class="st125" points="176.938,183.865 158.215,174.213 158.215,188.626 176.938,198.196 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_71_" points="156.791,195.5 132.782,208.218 109.804,196.373 133.823,183.663 												"/></defs>											<clipPath id="SVGID_72_">												<use xlink:href="#SVGID_71_"  style="overflow:visible;"/></clipPath>											<polygon class="st126" points="152.537,196.166 133.829,205.818 115.104,196.166 133.83,186.52 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_73_" points="156.791,195.5 132.782,208.218 109.804,196.373 133.823,183.663 												"/></defs>											<clipPath id="SVGID_74_">												<use xlink:href="#SVGID_73_"  style="overflow:visible;"/></clipPath>											<polygon class="st127" points="152.537,210.971 152.537,196.166 133.829,205.818 133.829,220.151 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_75_" points="156.791,195.5 132.782,208.218 109.804,196.373 133.823,183.663 												"/></defs>											<clipPath id="SVGID_76_">												<use xlink:href="#SVGID_75_"  style="overflow:visible;"/></clipPath>											<polygon class="st128" points="133.829,205.818 115.104,196.166 115.104,210.581 133.829,220.151 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<polygon class="st0" points="90.135,93.751 47.721,116.035 26.501,105.094 68.929,82.821 	"/><polygon class="st129" points="145.443,153.111 99.02,178.204 72.907,164.987 120.364,140.067 	"/><polygon class="st129" points="116.316,137.652 69.893,162.742 43.78,149.527 91.237,124.607 	"/><polygon class="st129" points="84.44,122.631 38.018,147.721 23.385,140.42 71.194,115.682 	"/><polygon class="st61" points="90.135,110.533 90.135,93.753 47.721,116.035 47.721,132.284 	"/><polygon class="st62" points="47.721,116.035 26.501,105.094 26.501,121.434 47.721,132.284 	"/><polygon class="st64" points="117.053,107.843 74.639,130.125 53.42,119.186 95.846,96.911 	"/><polygon class="st65" points="117.053,124.623 117.053,107.843 74.639,130.125 74.637,146.374 	"/><polygon class="st66" points="74.639,130.125 53.42,119.186 53.42,135.526 74.637,146.374 	"/><polygon class="st130" points="143.969,121.933 101.555,144.215 80.336,133.278 122.764,111.003 	"/><polygon class="st131" points="143.969,138.715 143.969,121.935 101.555,144.215 101.555,160.466 	"/><polygon class="st132" points="101.555,144.215 80.336,133.278 80.336,149.616 101.555,160.466 	"/><g class="st50">		<path class="st51" d="M37.327,4.91v3.355h-1.084V0.225h2.273c0.508,0,0.948,0.052,1.318,0.154			c0.371,0.104,0.676,0.252,0.918,0.446c0.24,0.194,0.42,0.43,0.535,0.704c0.116,0.275,0.174,0.583,0.174,0.923			c0,0.284-0.045,0.55-0.135,0.797s-0.219,0.469-0.39,0.665c-0.17,0.196-0.378,0.364-0.622,0.502			c-0.246,0.139-0.523,0.243-0.834,0.314c0.135,0.079,0.254,0.192,0.359,0.343l2.346,3.192h-0.965c-0.199,0-0.345-0.076-0.438-0.23			l-2.087-2.872c-0.064-0.09-0.133-0.154-0.208-0.194C38.412,4.93,38.301,4.91,38.151,4.91H37.327z M37.327,4.119h1.139			c0.318,0,0.598-0.038,0.839-0.115c0.241-0.076,0.443-0.186,0.606-0.325c0.162-0.141,0.285-0.308,0.367-0.503			c0.082-0.194,0.123-0.409,0.123-0.645c0-0.479-0.158-0.84-0.474-1.083c-0.316-0.243-0.786-0.365-1.411-0.365h-1.189V4.119z"/><path class="st51" d="M44.065,2.581v3.625c0,0.431,0.1,0.764,0.298,0.999s0.497,0.354,0.897,0.354			c0.292,0,0.566-0.069,0.825-0.208c0.258-0.138,0.495-0.331,0.712-0.577V2.581h1v5.685h-0.596c-0.143,0-0.232-0.069-0.27-0.208			l-0.078-0.611c-0.247,0.273-0.523,0.493-0.83,0.659c-0.307,0.167-0.658,0.25-1.055,0.25c-0.311,0-0.585-0.052-0.822-0.154			c-0.238-0.103-0.438-0.248-0.598-0.435c-0.161-0.188-0.281-0.414-0.362-0.68s-0.12-0.559-0.12-0.881V2.581H44.065z"/><path class="st51" d="M49.475,8.266V0h1.004v3.4c0.235-0.272,0.506-0.492,0.811-0.659c0.305-0.166,0.654-0.249,1.047-0.249			c0.329,0,0.627,0.062,0.893,0.185c0.266,0.124,0.491,0.308,0.678,0.553c0.188,0.245,0.332,0.548,0.433,0.909			s0.151,0.777,0.151,1.248c0,0.419-0.057,0.81-0.168,1.17c-0.112,0.361-0.274,0.674-0.485,0.938			c-0.212,0.264-0.47,0.472-0.774,0.623s-0.648,0.227-1.029,0.227c-0.367,0-0.679-0.07-0.935-0.213			c-0.257-0.142-0.479-0.34-0.671-0.595l-0.051,0.517c-0.029,0.142-0.115,0.213-0.258,0.213H49.475z M52.01,3.288			c-0.325,0-0.61,0.075-0.855,0.225c-0.244,0.15-0.471,0.361-0.676,0.635v2.749c0.18,0.247,0.379,0.421,0.598,0.521			c0.219,0.102,0.463,0.152,0.732,0.152c0.531,0,0.938-0.189,1.223-0.567c0.285-0.378,0.427-0.916,0.427-1.616			c0-0.37-0.032-0.688-0.099-0.953c-0.064-0.266-0.16-0.483-0.283-0.654c-0.123-0.17-0.275-0.294-0.454-0.373			C52.443,3.328,52.239,3.288,52.01,3.288z"/><path class="st51" d="M57.235,9.943c-0.033,0.075-0.076,0.135-0.127,0.18c-0.05,0.045-0.127,0.067-0.232,0.067h-0.74l1.037-2.256			l-2.345-5.354h0.864c0.086,0,0.153,0.022,0.201,0.065c0.049,0.043,0.085,0.09,0.107,0.143l1.521,3.58			c0.034,0.082,0.062,0.165,0.087,0.247s0.046,0.166,0.064,0.252c0.026-0.086,0.053-0.17,0.078-0.252			c0.027-0.082,0.057-0.167,0.09-0.253l1.477-3.574c0.021-0.06,0.061-0.109,0.115-0.148c0.054-0.039,0.112-0.06,0.176-0.06h0.797			L57.235,9.943z"/></g>	<circle class="st0" cx="49.054" cy="41.645" r="23.962"/><linearGradient id="SVGID_77_" gradientUnits="userSpaceOnUse" x1="-405.4271" y1="3348.791" x2="-411.5722" y2="3378.6384" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#EC4A54"/><stop  offset="0.166" style="stop-color:#E84852"/><stop  offset="0.3386" style="stop-color:#DB434B"/><stop  offset="0.5143" style="stop-color:#C73A41"/><stop  offset="0.6919" style="stop-color:#A92E32"/><stop  offset="0.8695" style="stop-color:#841E1F"/><stop  offset="1" style="stop-color:#64100E"/></linearGradient>	<polygon class="st133" points="57.981,46.352 52.924,40.39 49.036,46.87 	"/><polygon class="st4" points="52.924,40.39 57.075,37.668 57.981,46.352 	"/><linearGradient id="SVGID_78_" gradientUnits="userSpaceOnUse" x1="-393.469" y1="3372.3792" x2="-408.6128" y2="3380.4998" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#EC4A54"/><stop  offset="0.166" style="stop-color:#E84852"/><stop  offset="0.3386" style="stop-color:#DB434B"/><stop  offset="0.5143" style="stop-color:#C73A41"/><stop  offset="0.6919" style="stop-color:#A92E32"/><stop  offset="0.8695" style="stop-color:#841E1F"/><stop  offset="1" style="stop-color:#64100E"/></linearGradient>	<polygon class="st134" points="57.981,46.352 62.258,40.39 57.075,34.945 57.075,37.668 	"/><polygon class="st6" points="40.092,46.352 45.147,40.39 49.036,46.87 	"/><polygon class="st4" points="45.147,40.39 40.998,37.668 40.092,46.352 	"/><polygon class="st4" points="45.147,40.39 40.998,37.668 40.092,46.352 	"/><linearGradient id="SVGID_79_" gradientUnits="userSpaceOnUse" x1="-424.7658" y1="3374.4543" x2="-422.2025" y2="3378.8066" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>	<polygon class="st135" points="45.147,40.39 40.998,37.668 40.092,46.352 	"/><polygon class="st8" points="40.092,45.832 35.813,40.39 40.998,34.945 40.998,37.668 	"/><linearGradient id="SVGID_80_" gradientUnits="userSpaceOnUse" x1="-418.326" y1="3382.6038" x2="-425.8363" y2="3378.2227" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>	<polygon class="st136" points="40.092,45.832 35.813,40.39 40.998,34.945 40.998,37.668 	"/><linearGradient id="SVGID_81_" gradientUnits="userSpaceOnUse" x1="-428.2337" y1="3376.9009" x2="-416.1358" y2="3383.7642" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#61100D"/><stop  offset="0.1734" style="stop-color:#65100F;stop-opacity:0.8266"/><stop  offset="0.3537" style="stop-color:#721115;stop-opacity:0.6463"/><stop  offset="0.537" style="stop-color:#86131F;stop-opacity:0.463"/><stop  offset="0.7226" style="stop-color:#A4162D;stop-opacity:0.2774"/><stop  offset="0.9081" style="stop-color:#C9193F;stop-opacity:0.0919"/><stop  offset="1" style="stop-color:#DE1B49;stop-opacity:0"/></linearGradient>	<polygon class="st137" points="40.092,45.832 35.813,40.39 40.998,34.945 40.998,37.668 	"/><linearGradient id="SVGID_82_" gradientUnits="userSpaceOnUse" x1="-418.1246" y1="3379.7368" x2="-413.6648" y2="3376.7964" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#EB3842"/><stop  offset="1" style="stop-color:#AA1F26"/></linearGradient>	<polygon class="st138" points="49.036,40.388 45.147,40.388 45.147,40.39 49.036,46.87 52.924,40.39 52.924,40.388 	"/><linearGradient id="SVGID_83_" gradientUnits="userSpaceOnUse" x1="-419.8208" y1="3373.4065" x2="-413.3322" y2="3380.012" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0.42"/></linearGradient>	<polygon class="st139" points="49.036,40.388 45.147,40.388 45.147,40.39 49.036,46.87 52.924,40.39 52.924,40.388 	"/><polygon class="st13" points="53.509,32.83 49.036,32.83 44.564,32.83 40.998,34.945 40.998,37.668 45.147,40.39 49.036,40.388 		52.924,40.39 57.075,37.668 57.075,34.945 	"/><linearGradient id="SVGID_84_" gradientUnits="userSpaceOnUse" x1="-404.1762" y1="3396.6179" x2="-416.0822" y2="3382.3535" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>	<polygon class="st140" points="53.509,32.83 49.036,32.83 44.564,32.83 40.998,34.945 40.998,37.668 45.147,40.39 49.036,40.388 		52.924,40.39 57.075,37.668 57.075,34.945 	"/><polygon class="st1" points="49.055,46.869 49.055,52.951 57.981,46.352 	"/><linearGradient id="SVGID_85_" gradientUnits="userSpaceOnUse" x1="-399.1182" y1="3361.5925" x2="-422.4851" y2="3374.1226" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#EC4A54"/><stop  offset="0.166" style="stop-color:#E84852"/><stop  offset="0.3386" style="stop-color:#DB434B"/><stop  offset="0.5143" style="stop-color:#C73A41"/><stop  offset="0.6919" style="stop-color:#A92E32"/><stop  offset="0.8695" style="stop-color:#841E1F"/><stop  offset="1" style="stop-color:#64100E"/></linearGradient>	<polygon class="st141" points="49.055,46.869 49.036,46.87 40.092,46.352 49.036,52.963 49.055,52.951 	"/><g>		<g class="st50">			<path class="st51" d="M111.286,5.643c0.039,0.099,0.078,0.199,0.115,0.3c0.037-0.104,0.076-0.205,0.118-0.3				c0.041-0.096,0.088-0.191,0.14-0.289l2.722-4.943c0.049-0.086,0.099-0.139,0.151-0.157s0.127-0.028,0.225-0.028h0.803v8.041				h-0.954V2.357c0-0.079,0.002-0.163,0.006-0.253c0.003-0.09,0.009-0.182,0.017-0.275l-2.755,5.028				c-0.094,0.168-0.225,0.252-0.394,0.252h-0.156c-0.168,0-0.3-0.084-0.393-0.252l-2.817-5.045c0.011,0.098,0.02,0.193,0.025,0.286				c0.005,0.094,0.009,0.18,0.009,0.259v5.908h-0.954V0.225h0.802c0.098,0,0.172,0.01,0.225,0.028s0.104,0.071,0.152,0.157				l2.777,4.949C111.201,5.449,111.246,5.543,111.286,5.643z"/><path class="st51" d="M119.661,2.492c0.416,0,0.791,0.068,1.125,0.207c0.335,0.139,0.619,0.335,0.854,0.589				c0.233,0.255,0.413,0.562,0.538,0.924c0.126,0.36,0.188,0.764,0.188,1.209c0,0.449-0.062,0.853-0.188,1.212				c-0.125,0.359-0.305,0.666-0.538,0.92c-0.234,0.255-0.519,0.45-0.854,0.587c-0.334,0.137-0.709,0.204-1.125,0.204				c-0.415,0-0.79-0.067-1.125-0.204c-0.334-0.137-0.62-0.332-0.855-0.587c-0.236-0.254-0.418-0.561-0.545-0.92				s-0.19-0.763-0.19-1.212c0-0.445,0.063-0.849,0.19-1.209c0.127-0.361,0.309-0.669,0.545-0.924				c0.235-0.254,0.521-0.45,0.855-0.589C118.87,2.561,119.245,2.492,119.661,2.492z M119.661,7.564c0.562,0,0.98-0.188,1.258-0.564				c0.275-0.376,0.414-0.9,0.414-1.573c0-0.678-0.139-1.205-0.414-1.583c-0.277-0.378-0.696-0.566-1.258-0.566				c-0.284,0-0.531,0.049-0.74,0.146c-0.21,0.098-0.385,0.238-0.525,0.421c-0.14,0.184-0.244,0.409-0.314,0.677				c-0.068,0.268-0.104,0.569-0.104,0.906c0,0.336,0.035,0.638,0.104,0.903c0.07,0.266,0.175,0.489,0.314,0.67				c0.141,0.182,0.315,0.321,0.525,0.418C119.129,7.516,119.376,7.564,119.661,7.564z"/><path class="st51" d="M123.6,8.266V2.581h0.595c0.142,0,0.231,0.069,0.27,0.208l0.078,0.617c0.247-0.272,0.522-0.494,0.827-0.662				c0.306-0.168,0.658-0.252,1.059-0.252c0.311,0,0.584,0.051,0.822,0.154c0.237,0.103,0.436,0.248,0.594,0.438				c0.16,0.188,0.28,0.416,0.363,0.682c0.082,0.266,0.123,0.56,0.123,0.881v3.619h-0.999V4.646c0-0.431-0.099-0.764-0.295-1.002				c-0.196-0.237-0.497-0.356-0.9-0.356c-0.296,0-0.571,0.071-0.827,0.214c-0.257,0.142-0.493,0.335-0.711,0.578v4.186H123.6z"/><path class="st51" d="M131.752,2.486c0.247,0,0.479,0.027,0.693,0.081c0.215,0.055,0.41,0.134,0.586,0.238h1.543v0.37				c0,0.124-0.078,0.202-0.235,0.236l-0.646,0.09c0.127,0.243,0.191,0.514,0.191,0.813c0,0.276-0.054,0.528-0.16,0.755				c-0.107,0.227-0.254,0.42-0.443,0.58c-0.189,0.161-0.414,0.285-0.674,0.371s-0.545,0.129-0.855,0.129				c-0.266,0-0.516-0.032-0.752-0.096c-0.119,0.077-0.21,0.161-0.271,0.25c-0.062,0.089-0.093,0.176-0.093,0.261				c0,0.139,0.054,0.244,0.163,0.316c0.107,0.071,0.252,0.122,0.432,0.153s0.383,0.047,0.611,0.047s0.461,0,0.699,0				c0.236,0,0.47,0.021,0.698,0.062c0.228,0.041,0.433,0.109,0.611,0.204c0.18,0.095,0.323,0.226,0.433,0.392				c0.107,0.167,0.162,0.383,0.162,0.647c0,0.246-0.061,0.485-0.182,0.716c-0.122,0.231-0.297,0.437-0.525,0.616				c-0.229,0.181-0.507,0.324-0.836,0.433c-0.329,0.107-0.701,0.161-1.117,0.161c-0.414,0-0.778-0.041-1.091-0.123				c-0.312-0.083-0.571-0.193-0.776-0.332c-0.207-0.139-0.361-0.298-0.463-0.479c-0.104-0.182-0.154-0.372-0.154-0.57				c0-0.281,0.088-0.52,0.266-0.717c0.178-0.196,0.422-0.353,0.732-0.469c-0.16-0.074-0.289-0.175-0.385-0.3				c-0.095-0.125-0.143-0.292-0.143-0.501c0-0.082,0.015-0.167,0.045-0.255c0.029-0.088,0.076-0.175,0.137-0.261				c0.062-0.086,0.139-0.168,0.229-0.246c0.09-0.079,0.193-0.147,0.313-0.208c-0.28-0.157-0.5-0.365-0.659-0.625				c-0.159-0.261-0.238-0.564-0.238-0.912c0-0.277,0.053-0.528,0.16-0.755c0.106-0.227,0.255-0.419,0.445-0.578				c0.191-0.159,0.418-0.281,0.682-0.367S131.438,2.486,131.752,2.486z M133.526,8.554c0-0.145-0.039-0.261-0.117-0.349				c-0.079-0.088-0.186-0.155-0.32-0.203s-0.29-0.083-0.466-0.106c-0.176-0.022-0.361-0.034-0.556-0.034s-0.393,0-0.595,0				s-0.395-0.025-0.578-0.075c-0.213,0.101-0.386,0.225-0.519,0.371c-0.133,0.146-0.199,0.32-0.199,0.522				c0,0.127,0.032,0.246,0.098,0.356s0.166,0.206,0.301,0.287c0.135,0.08,0.304,0.144,0.508,0.19c0.203,0.047,0.443,0.07,0.721,0.07				c0.27,0,0.511-0.024,0.724-0.074c0.214-0.05,0.394-0.12,0.542-0.212c0.147-0.091,0.261-0.2,0.34-0.326				C133.487,8.846,133.526,8.707,133.526,8.554z M131.752,5.488c0.202,0,0.381-0.028,0.536-0.084				c0.155-0.057,0.285-0.135,0.39-0.236c0.105-0.101,0.184-0.222,0.236-0.361c0.052-0.141,0.078-0.295,0.078-0.463				c0-0.349-0.105-0.625-0.316-0.831c-0.212-0.205-0.52-0.309-0.924-0.309c-0.4,0-0.706,0.104-0.917,0.309				c-0.212,0.206-0.317,0.482-0.317,0.831c0,0.168,0.027,0.322,0.082,0.463c0.054,0.14,0.133,0.261,0.238,0.361				c0.104,0.102,0.233,0.18,0.387,0.236C131.378,5.46,131.554,5.488,131.752,5.488z"/><path class="st51" d="M137.874,2.492c0.415,0,0.79,0.068,1.125,0.207s0.619,0.335,0.853,0.589				c0.234,0.255,0.414,0.562,0.539,0.924c0.125,0.36,0.188,0.764,0.188,1.209c0,0.449-0.062,0.853-0.188,1.212				s-0.305,0.666-0.539,0.92c-0.233,0.255-0.518,0.45-0.853,0.587s-0.71,0.204-1.125,0.204s-0.79-0.067-1.125-0.204				s-0.62-0.332-0.855-0.587c-0.235-0.254-0.417-0.561-0.544-0.92s-0.191-0.763-0.191-1.212c0-0.445,0.064-0.849,0.191-1.209				c0.127-0.361,0.309-0.669,0.544-0.924c0.235-0.254,0.521-0.45,0.855-0.589S137.459,2.492,137.874,2.492z M137.874,7.564				c0.562,0,0.98-0.188,1.257-0.564c0.277-0.376,0.416-0.9,0.416-1.573c0-0.678-0.139-1.205-0.416-1.583				c-0.276-0.378-0.695-0.566-1.257-0.566c-0.284,0-0.531,0.049-0.741,0.146c-0.209,0.098-0.384,0.238-0.523,0.421				c-0.141,0.184-0.246,0.409-0.314,0.677c-0.069,0.268-0.104,0.569-0.104,0.906c0,0.336,0.034,0.638,0.104,0.903				c0.068,0.266,0.174,0.489,0.314,0.67c0.14,0.182,0.314,0.321,0.523,0.418C137.343,7.516,137.59,7.564,137.874,7.564z"/><path class="st51" d="M148.94,4.248c0,0.603-0.096,1.15-0.287,1.644c-0.189,0.494-0.459,0.917-0.808,1.269				c-0.348,0.352-0.765,0.624-1.251,0.816s-1.025,0.289-1.616,0.289h-3.007V0.225h3.007c0.591,0,1.13,0.097,1.616,0.289				s0.903,0.466,1.251,0.819c0.349,0.354,0.618,0.777,0.808,1.271C148.844,3.098,148.94,3.646,148.94,4.248z M147.823,4.248				c0-0.494-0.066-0.936-0.201-1.324s-0.326-0.719-0.572-0.987c-0.248-0.27-0.547-0.476-0.898-0.617				c-0.352-0.143-0.742-0.214-1.173-0.214h-1.913v6.279h1.913c0.431,0,0.821-0.071,1.173-0.213c0.352-0.143,0.65-0.348,0.898-0.615				c0.246-0.267,0.438-0.596,0.572-0.984S147.823,4.742,147.823,4.248z"/><path class="st51" d="M150.421,8.266V0.225h2.563c0.494,0,0.92,0.049,1.277,0.146c0.357,0.097,0.65,0.235,0.881,0.415				s0.4,0.399,0.511,0.659s0.165,0.553,0.165,0.878c0,0.198-0.031,0.39-0.092,0.572c-0.062,0.184-0.156,0.354-0.281,0.511				s-0.282,0.298-0.471,0.421c-0.189,0.123-0.411,0.225-0.666,0.303c0.588,0.116,1.031,0.328,1.33,0.635				c0.3,0.307,0.449,0.71,0.449,1.212c0,0.34-0.062,0.65-0.188,0.931c-0.126,0.281-0.309,0.522-0.551,0.725				c-0.24,0.202-0.536,0.358-0.887,0.468c-0.35,0.111-0.748,0.166-1.197,0.166H150.421z M151.51,3.827h1.436				c0.307,0,0.572-0.033,0.797-0.101s0.41-0.161,0.559-0.281c0.148-0.119,0.258-0.265,0.328-0.435				c0.071-0.17,0.107-0.356,0.107-0.559c0-0.471-0.143-0.817-0.428-1.038c-0.283-0.221-0.725-0.331-1.324-0.331h-1.475V3.827z				 M151.51,4.602v2.8h1.738c0.311,0,0.578-0.035,0.801-0.106s0.405-0.171,0.549-0.3c0.145-0.13,0.25-0.283,0.317-0.461				c0.067-0.177,0.101-0.373,0.101-0.586c0-0.415-0.146-0.743-0.439-0.984c-0.294-0.242-0.738-0.362-1.333-0.362H151.51z"/></g>	</g>	<g class="st50">		<path class="st51" d="M190.457,5.643c0.039,0.099,0.078,0.199,0.115,0.3c0.037-0.104,0.076-0.205,0.118-0.3			c0.041-0.096,0.088-0.191,0.14-0.289l2.722-4.943c0.049-0.086,0.099-0.139,0.151-0.157s0.127-0.028,0.225-0.028h0.803v8.041			h-0.954V2.357c0-0.079,0.002-0.163,0.006-0.253c0.003-0.09,0.009-0.182,0.017-0.275l-2.755,5.028			c-0.094,0.168-0.225,0.252-0.394,0.252h-0.156c-0.168,0-0.3-0.084-0.393-0.252l-2.817-5.045c0.011,0.098,0.02,0.193,0.025,0.286			c0.005,0.094,0.009,0.18,0.009,0.259v5.908h-0.954V0.225h0.802c0.098,0,0.172,0.01,0.225,0.028s0.104,0.071,0.152,0.157			l2.777,4.949C190.372,5.449,190.418,5.543,190.457,5.643z"/><path class="st51" d="M198.782,2.492c0.341,0,0.655,0.057,0.943,0.171c0.287,0.114,0.537,0.278,0.746,0.493			c0.209,0.216,0.373,0.481,0.491,0.797c0.118,0.316,0.177,0.677,0.177,1.08c0,0.157-0.018,0.263-0.051,0.314			c-0.033,0.053-0.098,0.079-0.191,0.079h-3.781c0.008,0.358,0.057,0.671,0.146,0.937s0.213,0.487,0.369,0.665			c0.158,0.178,0.345,0.311,0.562,0.398c0.218,0.088,0.46,0.132,0.729,0.132c0.25,0,0.467-0.029,0.648-0.087			s0.338-0.121,0.469-0.188c0.131-0.066,0.24-0.13,0.328-0.188s0.163-0.087,0.227-0.087c0.082,0,0.146,0.032,0.191,0.096l0.28,0.364			c-0.124,0.149-0.271,0.279-0.443,0.39c-0.172,0.11-0.356,0.201-0.553,0.272s-0.399,0.124-0.608,0.16			c-0.21,0.035-0.418,0.053-0.623,0.053c-0.393,0-0.755-0.066-1.086-0.199c-0.331-0.132-0.617-0.327-0.858-0.583			s-0.429-0.573-0.563-0.951s-0.203-0.812-0.203-1.302c0-0.396,0.062-0.767,0.184-1.111c0.121-0.344,0.296-0.643,0.523-0.895			c0.229-0.253,0.508-0.451,0.837-0.595C198,2.563,198.37,2.492,198.782,2.492z M198.805,3.227c-0.482,0-0.863,0.14-1.14,0.418			c-0.276,0.279-0.448,0.665-0.517,1.159h3.092c0-0.232-0.031-0.444-0.096-0.637c-0.062-0.193-0.156-0.359-0.279-0.5			c-0.124-0.14-0.274-0.248-0.452-0.325C199.236,3.266,199.033,3.227,198.805,3.227z"/><path class="st51" d="M202.412,8.266V2.581h0.595c0.142,0,0.231,0.069,0.27,0.208l0.073,0.584c0.209-0.259,0.443-0.47,0.703-0.635			c0.261-0.164,0.562-0.246,0.906-0.246c0.386,0,0.697,0.106,0.935,0.319s0.409,0.501,0.514,0.864			c0.079-0.206,0.183-0.384,0.312-0.533s0.273-0.273,0.435-0.37c0.161-0.098,0.332-0.169,0.514-0.214			c0.181-0.045,0.366-0.066,0.553-0.066c0.3,0,0.565,0.047,0.8,0.143c0.233,0.096,0.432,0.234,0.594,0.418			c0.164,0.184,0.287,0.409,0.374,0.676c0.086,0.268,0.129,0.574,0.129,0.918v3.619h-0.999V4.646c0-0.445-0.098-0.783-0.291-1.013			c-0.195-0.23-0.478-0.346-0.848-0.346c-0.165,0-0.32,0.029-0.469,0.087c-0.148,0.059-0.277,0.144-0.391,0.256			c-0.111,0.112-0.201,0.253-0.266,0.424c-0.066,0.17-0.099,0.367-0.099,0.592v3.619h-0.999V4.646c0-0.456-0.092-0.797-0.274-1.021			c-0.184-0.225-0.451-0.337-0.803-0.337c-0.247,0-0.476,0.066-0.687,0.199c-0.212,0.133-0.406,0.313-0.582,0.542v4.236H202.412z"/><path class="st51" d="M215.503,3.592c-0.03,0.041-0.06,0.072-0.09,0.095s-0.073,0.034-0.13,0.034c-0.056,0-0.116-0.023-0.182-0.07			s-0.148-0.099-0.25-0.154c-0.101-0.056-0.223-0.107-0.367-0.154s-0.32-0.07-0.53-0.07c-0.276,0-0.522,0.05-0.735,0.148			c-0.213,0.1-0.392,0.243-0.535,0.43c-0.145,0.188-0.253,0.413-0.326,0.679c-0.072,0.266-0.109,0.563-0.109,0.893			c0,0.344,0.039,0.649,0.118,0.917s0.188,0.492,0.331,0.674s0.314,0.319,0.52,0.415c0.203,0.096,0.432,0.144,0.687,0.144			c0.243,0,0.443-0.029,0.601-0.088c0.157-0.058,0.288-0.122,0.393-0.193c0.105-0.071,0.191-0.136,0.258-0.193			c0.068-0.058,0.135-0.087,0.203-0.087c0.086,0,0.148,0.032,0.19,0.096l0.28,0.364c-0.247,0.303-0.556,0.524-0.926,0.665			s-0.762,0.21-1.173,0.21c-0.355,0-0.686-0.065-0.99-0.196c-0.306-0.131-0.569-0.32-0.794-0.569s-0.401-0.555-0.53-0.917			c-0.129-0.363-0.194-0.776-0.194-1.24c0-0.423,0.06-0.813,0.178-1.173c0.117-0.359,0.289-0.669,0.516-0.929			s0.506-0.463,0.84-0.608c0.332-0.146,0.714-0.219,1.145-0.219c0.396,0,0.748,0.064,1.055,0.193s0.578,0.312,0.813,0.547			L215.503,3.592z"/><path class="st51" d="M221.041,8.266h-0.443c-0.098,0-0.176-0.015-0.236-0.045c-0.059-0.03-0.099-0.094-0.117-0.19l-0.112-0.527			c-0.149,0.134-0.296,0.255-0.438,0.361c-0.143,0.106-0.292,0.196-0.449,0.27s-0.324,0.128-0.502,0.165			c-0.178,0.038-0.375,0.057-0.593,0.057c-0.221,0-0.427-0.031-0.619-0.093c-0.193-0.062-0.36-0.155-0.502-0.279			c-0.143-0.123-0.256-0.28-0.34-0.47s-0.127-0.414-0.127-0.673c0-0.226,0.062-0.442,0.186-0.65s0.322-0.394,0.598-0.555			s0.635-0.294,1.08-0.396c0.445-0.104,0.99-0.155,1.633-0.155V4.638c0-0.444-0.094-0.779-0.283-1.008			c-0.189-0.228-0.469-0.342-0.839-0.342c-0.243,0-0.448,0.031-0.614,0.093s-0.311,0.131-0.432,0.208			c-0.122,0.076-0.227,0.146-0.314,0.207c-0.088,0.062-0.176,0.093-0.262,0.093c-0.066,0-0.125-0.018-0.176-0.053			c-0.051-0.036-0.092-0.08-0.121-0.132l-0.18-0.32c0.314-0.303,0.652-0.529,1.016-0.679s0.766-0.225,1.207-0.225			c0.317,0,0.6,0.053,0.847,0.157s0.454,0.251,0.623,0.438c0.169,0.188,0.296,0.413,0.382,0.679s0.129,0.558,0.129,0.876V8.266z			 M218.449,7.654c0.176,0,0.337-0.018,0.483-0.054c0.146-0.035,0.283-0.086,0.412-0.151s0.252-0.145,0.37-0.238			s0.233-0.2,0.345-0.32V5.718c-0.46,0-0.851,0.029-1.172,0.088c-0.322,0.059-0.584,0.135-0.786,0.229s-0.349,0.205-0.44,0.333			s-0.138,0.271-0.138,0.429c0,0.15,0.024,0.28,0.073,0.39s0.113,0.198,0.196,0.269c0.082,0.069,0.18,0.12,0.292,0.152			C218.196,7.638,218.318,7.654,218.449,7.654z"/><path class="st51" d="M226.434,3.592c-0.03,0.041-0.061,0.072-0.09,0.095c-0.03,0.022-0.073,0.034-0.129,0.034			c-0.057,0-0.117-0.023-0.183-0.07s-0.149-0.099-0.249-0.154c-0.102-0.056-0.225-0.107-0.368-0.154s-0.321-0.07-0.53-0.07			c-0.277,0-0.521,0.05-0.735,0.148c-0.213,0.1-0.392,0.243-0.536,0.43c-0.144,0.188-0.252,0.413-0.325,0.679			s-0.109,0.563-0.109,0.893c0,0.344,0.04,0.649,0.118,0.917s0.188,0.492,0.331,0.674c0.142,0.182,0.315,0.319,0.519,0.415			c0.204,0.096,0.434,0.144,0.688,0.144c0.243,0,0.443-0.029,0.601-0.088c0.157-0.058,0.288-0.122,0.393-0.193			s0.19-0.136,0.259-0.193c0.066-0.058,0.135-0.087,0.201-0.087c0.086,0,0.15,0.032,0.191,0.096l0.28,0.364			c-0.247,0.303-0.556,0.524-0.926,0.665s-0.761,0.21-1.173,0.21c-0.355,0-0.686-0.065-0.99-0.196s-0.57-0.32-0.794-0.569			c-0.225-0.249-0.401-0.555-0.53-0.917c-0.129-0.363-0.193-0.776-0.193-1.24c0-0.423,0.059-0.813,0.176-1.173			c0.119-0.359,0.291-0.669,0.518-0.929c0.226-0.26,0.506-0.463,0.838-0.608c0.333-0.146,0.715-0.219,1.145-0.219			c0.396,0,0.748,0.064,1.055,0.193s0.578,0.312,0.814,0.547L226.434,3.592z"/><path class="st51" d="M227.797,8.266V0h0.998v3.345c0.244-0.258,0.514-0.465,0.809-0.62s0.636-0.232,1.021-0.232			c0.311,0,0.584,0.051,0.822,0.154c0.237,0.103,0.436,0.248,0.594,0.438c0.16,0.188,0.28,0.416,0.363,0.682			c0.082,0.266,0.123,0.56,0.123,0.881v3.619h-0.999V4.646c0-0.431-0.099-0.764-0.295-1.002c-0.196-0.237-0.497-0.356-0.9-0.356			c-0.296,0-0.571,0.071-0.827,0.214c-0.257,0.142-0.493,0.335-0.711,0.578v4.186H227.797z"/><path class="st51" d="M236.287,2.492c0.34,0,0.654,0.057,0.942,0.171s0.536,0.278,0.746,0.493c0.21,0.216,0.373,0.481,0.491,0.797			c0.117,0.316,0.177,0.677,0.177,1.08c0,0.157-0.017,0.263-0.051,0.314c-0.034,0.053-0.097,0.079-0.19,0.079h-3.782			c0.007,0.358,0.056,0.671,0.146,0.937s0.213,0.487,0.371,0.665c0.156,0.178,0.344,0.311,0.561,0.398s0.461,0.132,0.729,0.132			c0.251,0,0.467-0.029,0.648-0.087c0.181-0.058,0.337-0.121,0.468-0.188c0.131-0.066,0.24-0.13,0.328-0.188			s0.164-0.087,0.229-0.087c0.082,0,0.146,0.032,0.19,0.096l0.28,0.364c-0.123,0.149-0.271,0.279-0.443,0.39			s-0.355,0.201-0.553,0.272c-0.196,0.071-0.399,0.124-0.609,0.16c-0.209,0.035-0.416,0.053-0.622,0.053			c-0.394,0-0.755-0.066-1.086-0.199c-0.331-0.132-0.617-0.327-0.858-0.583s-0.43-0.573-0.564-0.951s-0.201-0.812-0.201-1.302			c0-0.396,0.061-0.767,0.182-1.111c0.122-0.344,0.297-0.643,0.525-0.895c0.229-0.253,0.506-0.451,0.836-0.595			C235.505,2.563,235.875,2.492,236.287,2.492z M236.309,3.227c-0.482,0-0.861,0.14-1.139,0.418			c-0.277,0.279-0.449,0.665-0.516,1.159h3.092c0-0.232-0.032-0.444-0.096-0.637c-0.064-0.193-0.157-0.359-0.281-0.5			c-0.123-0.14-0.273-0.248-0.451-0.325C236.741,3.266,236.537,3.227,236.309,3.227z"/><path class="st51" d="M243.918,8.266c-0.143,0-0.232-0.069-0.27-0.208l-0.09-0.689c-0.243,0.295-0.521,0.532-0.834,0.71			c-0.312,0.177-0.67,0.266-1.074,0.266c-0.325,0-0.621-0.062-0.887-0.188s-0.491-0.31-0.678-0.553			c-0.188-0.243-0.332-0.546-0.433-0.909c-0.101-0.362-0.151-0.78-0.151-1.251c0-0.419,0.056-0.809,0.168-1.17			s0.273-0.675,0.485-0.94s0.469-0.474,0.771-0.625c0.304-0.151,0.647-0.228,1.032-0.228c0.348,0,0.646,0.059,0.893,0.177			s0.468,0.283,0.662,0.497V0h0.999v8.266H243.918z M241.983,7.536c0.324,0,0.609-0.075,0.855-0.225			c0.244-0.149,0.471-0.36,0.676-0.634v-2.75c-0.184-0.246-0.385-0.42-0.604-0.519s-0.461-0.148-0.727-0.148			c-0.531,0-0.939,0.188-1.223,0.566c-0.285,0.378-0.427,0.917-0.427,1.616c0,0.37,0.032,0.688,0.095,0.951			c0.064,0.264,0.158,0.48,0.281,0.65c0.123,0.171,0.275,0.295,0.455,0.373C241.544,7.497,241.75,7.536,241.983,7.536z"/></g>	<g>		<circle class="st81" cx="214.65" cy="41.898" r="24.205"/></g>	<path class="st91" d="M214.186,57.726c10.4,0,14.029-7.479,14.029-12.504c0-5.024-1.278-12.35-8.064-19.137		c0,4.719-0.051,10.675-5.529,10.675"/><path class="st91" d="M215.053,57.726c-10.398,0-14.025-7.479-14.025-12.504c0-5.024,1.275-12.35,8.062-19.137		c0,4.719,0.053,10.675,5.531,10.675"/><g>		<circle class="st91" cx="222.346" cy="44.803" r="3.117"/></g>	<g>		<path class="st92" d="M222.346,42.047c1.523,0,2.758,1.233,2.758,2.756c0,1.524-1.229,2.758-2.758,2.758s-2.758-1.234-2.758-2.758			C219.588,43.28,220.823,42.047,222.346,42.047 M222.346,41.252c-1.959,0-3.553,1.593-3.553,3.551c0,1.959,1.594,3.553,3.553,3.553			s3.553-1.594,3.553-3.553C225.899,42.845,224.305,41.252,222.346,41.252L222.346,41.252z"/></g>	<polyline class="st142" points="215.031,47.306 215.031,52.688 211.903,55.717 	"/><line class="st142" x1="218.173" y1="55.625" x2="215.031" y2="52.382"/><g>		<circle class="st91" cx="207.763" cy="44.803" r="3.118"/></g>	<polygon class="st94" points="216.797,46.838 215.053,48.582 213.309,46.838 	"/><g>		<path class="st92" d="M207.762,42.047c1.521,0,2.759,1.233,2.759,2.756c0,1.524-1.235,2.758-2.759,2.758			c-1.521,0-2.758-1.234-2.758-2.758C205.004,43.28,206.241,42.047,207.762,42.047 M207.762,41.252			c-1.959,0-3.553,1.593-3.553,3.551c0,1.959,1.594,3.553,3.553,3.553s3.554-1.594,3.554-3.553			C211.316,42.845,209.721,41.252,207.762,41.252L207.762,41.252z"/></g>	<g>		<circle class="st80" cx="131.7" cy="41.596" r="23.913"/></g>	<path class="st109" d="M131.346,29.79"/><line class="st143" x1="131.348" y1="52.539" x2="131.348" y2="56.493"/><path class="st111" d="M131.348,27.442v25.653c0,0,6.676-4.634,6.676-12.238S131.348,27.442,131.348,27.442z"/><path class="st112" d="M131.348,27.442v25.653c0,0-6.675-4.634-6.675-12.238S131.348,27.442,131.348,27.442z"/></g><g id="build-cont-launches" data-size="342x204" class="nanobox-svg ">	<g>		<polygon class="st15" points="341.58,150.856 246.678,199.771 151.774,150.856 246.678,101.939 		"/><polygon class="st15" points="322.232,150.856 246.678,189.799 171.121,150.856 246.678,111.909 		"/><polygon class="st16" points="193.471,142.904 174.582,152.628 171.216,150.854 190.105,141.131 		"/><polygon class="st16" points="213.68,138.664 187.1,152.365 183.734,150.591 210.313,136.89 		"/><polygon class="st16" points="219.685,141.758 193.104,155.458 189.738,153.688 216.319,139.986 		"/><polygon class="st16" points="225.69,144.852 199.11,158.556 195.745,156.782 222.323,143.081 		"/><polygon class="st16" points="220.886,157.046 201.997,166.77 198.632,164.999 217.522,155.274 		"/><polygon class="st16" points="241.097,152.807 214.515,166.509 211.149,164.735 237.729,151.034 		"/><polygon class="st16" points="247.1,155.903 220.519,169.603 217.152,167.83 243.733,154.13 		"/><polygon class="st16" points="253.104,158.998 226.524,172.699 223.157,170.927 249.737,157.224 		"/><polygon class="st16" points="247.35,170.685 228.462,180.409 225.094,178.636 243.984,168.914 		"/><polygon class="st16" points="267.561,166.446 240.981,180.148 237.612,178.374 264.194,164.673 		"/><polygon class="st16" points="273.566,169.542 246.984,183.244 243.616,181.47 270.199,167.77 		"/><polygon class="st16" points="279.57,172.636 252.988,186.338 249.621,184.565 276.202,170.864 		"/><polygon class="st16" points="235.908,121.24 217.019,130.965 213.651,129.192 232.54,119.466 		"/><polygon class="st16" points="256.116,117 229.536,130.701 226.17,128.927 252.75,115.226 		"/><polygon class="st16" points="262.121,120.094 235.541,133.796 232.175,132.022 258.754,118.322 		"/><polygon class="st16" points="268.126,123.188 241.545,136.891 238.178,135.118 264.76,121.417 		"/><polygon class="st16" points="263.324,135.383 244.435,145.107 241.067,143.334 259.956,133.611 		"/><polygon class="st16" points="283.532,131.145 256.952,144.846 253.585,143.073 280.166,129.37 		"/><polygon class="st16" points="289.536,134.239 262.956,147.939 259.586,146.167 286.17,132.467 		"/><polygon class="st16" points="295.541,137.334 268.96,151.034 265.594,149.26 292.173,135.56 		"/><polygon class="st16" points="289.786,149.022 270.899,158.746 267.532,156.974 286.422,147.251 		"/><polygon class="st16" points="309.996,144.783 283.415,158.485 280.049,156.712 306.629,143.01 		"/><polygon class="st16" points="316.003,147.878 289.42,161.58 286.054,159.806 312.633,146.106 		"/><polygon class="st16" points="322.006,150.974 295.424,164.673 292.057,162.901 318.638,149.199 		"/><polygon class="st17" points="246.678,199.771 341.58,150.856 341.58,154.443 246.678,203.358 		"/><polygon class="st18" points="246.678,199.771 151.774,150.856 151.774,154.443 246.678,203.358 		"/></g>	<polygon class="st144" points="333.899,146.901 246.678,191.857 159.456,146.901 246.678,101.943 	"/><polygon class="st19" points="198.215,55.468 100.275,105.952 0,54.56 97.942,4.08 	"/><polygon class="st20" points="114.074,66.827 79.518,84.984 62.232,76.068 96.795,57.923 	"/><polygon class="st21" points="62.232,75.959 96.795,57.808 96.795,69.785 73.628,81.947 	"/><polyline class="st22" points="96.795,57.808 96.795,69.785 102.639,72.835 114.074,66.827 	"/><polygon class="st20" points="92.144,55.463 57.585,73.618 40.298,64.707 74.868,46.556 	"/><polygon class="st21" points="40.298,64.59 74.868,46.441 74.868,58.416 51.7,70.58 	"/><polyline class="st22" points="74.868,46.441 74.868,58.416 80.71,61.464 92.144,55.463 	"/><polygon class="st20" points="70.213,43.98 35.656,62.136 18.37,53.224 52.935,35.073 	"/><polygon class="st21" points="18.37,53.11 52.935,34.959 52.935,46.935 29.768,59.101 	"/><polyline class="st22" points="52.935,34.959 52.935,46.935 58.777,49.985 70.213,43.98 	"/><polygon class="st22" points="100.275,106.083 198.215,55.6 198.215,80.632 100.275,131.114 	"/><polygon class="st21" points="100.275,106.083 0,54.56 0,79.593 100.275,131.114 	"/><polygon class="st20" points="180.786,54.786 162.725,64.354 145.441,55.444 163.507,45.882 	"/><polygon class="st21" points="145.441,55.33 163.507,45.766 163.507,57.742 156.836,61.32 	"/><polyline class="st22" points="163.507,45.766 163.507,57.742 169.353,60.794 180.786,54.786 	"/><polygon class="st20" points="159.264,43.426 124.71,61.581 107.422,52.667 141.989,34.521 	"/><polyline class="st22" points="141.989,34.407 141.989,46.383 147.835,49.434 159.264,43.426 	"/><polygon class="st21" points="107.422,52.552 141.989,34.407 141.989,46.376 118.817,58.538 	"/><polygon class="st20" points="136.922,31.942 102.366,50.094 85.081,41.18 119.647,23.035 	"/><polygon class="st21" points="85.081,41.07 119.647,22.921 119.647,34.898 96.481,47.056 	"/><polyline class="st22" points="119.647,22.921 119.647,34.898 125.492,37.948 136.922,31.942 	"/><polygon class="st20" points="114.996,20.459 80.438,38.614 63.149,29.702 97.718,11.554 	"/><polygon class="st21" points="63.368,29.629 97.795,11.554 97.795,23.478 74.722,35.59 	"/><polyline class="st22" points="97.795,11.554 97.795,23.478 103.613,26.518 115.003,20.535 	"/><g>		<polygon class="st20" points="118.403,87.001 100.343,96.57 83.059,87.655 101.128,78.095 		"/><polygon class="st21" points="83.059,87.544 101.128,77.979 101.128,89.954 94.455,93.533 		"/><polyline class="st22" points="101.128,77.979 101.128,89.954 106.969,93.009 118.403,87.001 		"/></g>	<g>		<polygon class="st20" points="150.378,70.321 132.318,79.889 115.034,70.976 133.101,61.417 		"/><polygon class="st21" points="115.034,70.865 133.101,61.302 133.101,73.276 126.43,76.852 		"/><polyline class="st22" points="133.101,61.302 133.101,73.276 138.945,76.329 150.378,70.321 		"/></g>	<g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_86_" points="150.379,70.321 132.316,79.888 115.032,70.977 133.099,61.417 												"/></defs>											<clipPath id="SVGID_87_">												<use xlink:href="#SVGID_86_"  style="overflow:visible;"/></clipPath>											<polygon class="st145" points="147.179,70.822 133.105,78.083 119.02,70.822 133.107,63.565 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_88_" points="150.379,70.321 132.316,79.888 115.032,70.977 133.099,61.417 												"/></defs>											<clipPath id="SVGID_89_">												<use xlink:href="#SVGID_88_"  style="overflow:visible;"/></clipPath>											<polygon class="st146" points="147.179,81.959 147.179,70.822 133.105,78.083 133.105,88.864 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_90_" points="150.379,70.321 132.316,79.888 115.032,70.977 133.099,61.417 												"/></defs>											<clipPath id="SVGID_91_">												<use xlink:href="#SVGID_90_"  style="overflow:visible;"/></clipPath>											<polygon class="st147" points="133.105,78.083 119.02,70.822 119.02,81.666 133.105,88.864 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>	<g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_92_" points="118.405,87.002 100.344,96.57 83.059,87.658 101.126,78.097 												"/></defs>											<clipPath id="SVGID_93_">												<use xlink:href="#SVGID_92_"  style="overflow:visible;"/></clipPath>											<polygon class="st148" points="115.205,87.504 101.131,94.763 87.045,87.504 101.133,80.247 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_94_" points="118.405,87.002 100.344,96.57 83.059,87.658 101.126,78.097 												"/></defs>											<clipPath id="SVGID_95_">												<use xlink:href="#SVGID_94_"  style="overflow:visible;"/></clipPath>											<polygon class="st149" points="115.205,98.64 115.205,87.504 101.131,94.763 101.131,105.546 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_96_" points="118.405,87.002 100.344,96.57 83.059,87.658 101.126,78.097 												"/></defs>											<clipPath id="SVGID_97_">												<use xlink:href="#SVGID_96_"  style="overflow:visible;"/></clipPath>											<polygon class="st150" points="101.131,94.763 87.045,87.504 87.045,98.347 101.131,105.546 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>			<linearGradient id="SVGID_98_" gradientUnits="userSpaceOnUse" x1="-355.8355" y1="3409.8918" x2="-355.8355" y2="3327.2771" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#23D5DB;stop-opacity:0"/><stop  offset="1" style="stop-color:#23D5DB"/></linearGradient>	<polygon class="st151" points="115.201,87.858 115.201,0 101.128,7.26 101.128,94.763 	"/><linearGradient id="SVGID_99_" gradientUnits="userSpaceOnUse" x1="-369.9135" y1="3409.8918" x2="-369.9135" y2="3327.2771" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#23D5DB;stop-opacity:0"/><stop  offset="1" style="stop-color:#148EA3"/></linearGradient>	<polygon class="st152" points="101.128,7.26 87.045,0 87.045,87.565 101.128,94.763 	"/><g>		<g>			<line class="st153" x1="165.946" y1="120.617" x2="164.884" y2="120.106"/><line class="st154" x1="163.458" y1="119.42" x2="114.236" y2="95.751"/><line class="st153" x1="113.523" y1="95.408" x2="112.462" y2="94.897"/><g>				<path class="st15" d="M109.471,93.459c1.658,0.155,3.833,0.103,5.369-0.32l-1.985,1.947l-0.281,2.766					C111.945,96.388,110.628,94.657,109.471,93.459z"/></g>		</g>	</g>	<g>		<g>			<line class="st153" x1="165.946" y1="153.907" x2="164.893" y2="153.379"/><line class="st155" x1="163.438" y1="152.65" x2="138.703" y2="140.251"/><polyline class="st153" points="137.975,139.886 136.922,139.359 136.621,138.219 			"/><line class="st156" x1="136.227" y1="136.723" x2="127.54" y2="103.797"/><line class="st153" x1="127.343" y1="103.048" x2="127.042" y2="101.909"/></g>	</g>	<g>		<polygon class="st15" points="341.58,127.55 246.678,176.464 151.774,127.55 246.678,78.632 		"/><polygon class="st15" points="322.232,127.55 246.678,166.494 171.121,127.55 246.678,88.603 		"/><polygon class="st16" points="193.471,119.597 174.582,129.322 171.216,127.547 190.105,117.825 		"/><polygon class="st16" points="213.68,115.358 187.1,129.058 183.734,127.286 210.313,113.585 		"/><polygon class="st16" points="219.685,118.452 193.104,132.152 189.738,130.381 216.319,116.679 		"/><polygon class="st16" points="225.69,121.547 199.11,135.25 195.745,133.475 222.323,119.773 		"/><polygon class="st16" points="220.886,133.74 201.997,143.464 198.632,141.692 217.522,131.969 		"/><polygon class="st16" points="241.097,129.5 214.515,143.203 211.149,141.428 237.729,127.728 		"/><polygon class="st16" points="247.1,132.596 220.519,146.298 217.152,144.524 243.733,130.824 		"/><polygon class="st16" points="253.104,135.692 226.524,149.392 223.157,147.62 249.737,133.919 		"/><polygon class="st16" points="247.35,147.38 228.462,157.103 225.094,155.331 243.984,145.607 		"/><polygon class="st16" points="267.561,143.14 240.981,156.842 237.612,155.067 264.194,141.367 		"/><polygon class="st16" points="273.566,146.236 246.984,159.936 243.616,158.163 270.199,144.464 		"/><polygon class="st16" points="279.57,149.331 252.988,163.031 249.621,161.259 276.202,147.559 		"/><polygon class="st16" points="235.908,97.934 217.019,107.658 213.651,105.886 232.54,96.159 		"/><polygon class="st16" points="256.116,93.694 229.536,107.396 226.17,105.622 252.75,91.921 		"/><polygon class="st16" points="262.121,96.788 235.541,110.488 232.175,108.716 258.754,95.016 		"/><polygon class="st16" points="268.126,99.882 241.545,113.586 238.178,111.812 264.76,98.111 		"/><polygon class="st16" points="263.324,112.076 244.435,121.801 241.067,120.028 259.956,110.304 		"/><polygon class="st16" points="283.532,107.838 256.952,121.539 253.585,119.765 280.166,106.064 		"/><polygon class="st16" points="289.536,110.933 262.956,124.633 259.586,122.86 286.17,109.162 		"/><polygon class="st16" points="295.541,114.028 268.96,127.728 265.594,125.955 292.173,112.255 		"/><polygon class="st16" points="289.786,125.716 270.899,135.44 267.532,133.669 286.422,123.945 		"/><polygon class="st16" points="309.996,121.478 283.415,135.178 280.049,133.404 306.629,119.704 		"/><polygon class="st16" points="316.003,124.572 289.42,138.274 286.054,136.501 312.633,122.798 		"/><polygon class="st16" points="322.006,127.668 295.424,141.367 292.057,139.595 318.638,125.893 		"/><polygon class="st17" points="246.678,176.464 341.58,127.55 341.58,131.137 246.678,180.051 		"/><polygon class="st18" points="246.678,176.464 151.774,127.55 151.774,131.137 246.678,180.051 		"/></g></g><g id="nanobox-initializes" data-size="293x219" class="nanobox-svg ">	<polygon class="st19" points="292.655,107.142 148.049,181.679 0,105.804 144.605,31.268 	"/><polygon class="st20" points="168.424,123.912 117.402,150.722 91.878,137.556 142.912,110.765 	"/><polygon class="st21" points="91.878,137.394 142.912,110.597 142.912,128.277 108.702,146.238 	"/><polyline class="st22" points="142.912,110.597 142.912,128.277 151.538,132.781 168.424,123.912 	"/><polygon class="st20" points="136.045,107.131 85.02,133.939 59.496,120.781 110.531,93.984 	"/><polygon class="st21" points="59.496,120.611 110.531,93.812 110.531,111.496 76.328,129.453 	"/><polyline class="st22" points="110.531,93.812 110.531,111.496 119.162,115.998 136.045,107.131 	"/><polygon class="st20" points="103.664,90.179 52.642,116.988 27.119,103.828 78.154,77.033 	"/><polygon class="st21" points="27.119,103.662 78.154,76.861 78.154,94.545 43.944,112.504 	"/><polyline class="st22" points="78.154,76.861 78.154,94.545 86.779,99.047 103.664,90.179 	"/><polygon class="st22" points="148.049,181.873 292.655,107.34 292.655,144.297 148.049,218.83 	"/><polygon class="st21" points="148.049,181.873 0,105.804 0,142.763 148.049,218.83 	"/><polygon class="st20" points="222.363,129.099 195.698,143.228 170.178,130.069 196.853,115.951 	"/><polygon class="st21" points="170.178,129.902 196.853,115.781 196.853,133.463 187.005,138.744 	"/><polyline class="st22" points="196.853,115.781 196.853,133.463 205.483,137.971 222.363,129.099 	"/><polygon class="st20" points="234.543,89.187 183.52,115.996 157.998,102.835 209.031,76.036 	"/><polygon class="st21" points="157.998,102.666 209.031,75.877 209.031,93.547 174.822,111.507 	"/><polyline class="st22" points="209.031,75.877 209.031,93.547 217.66,98.054 234.543,89.187 	"/><polygon class="st20" points="202.159,72.404 151.139,99.209 125.615,86.047 176.65,59.256 	"/><polygon class="st21" points="125.615,85.882 176.65,59.087 176.65,76.768 142.445,94.722 	"/><polyline class="st22" points="176.65,59.087 176.65,76.768 185.279,81.272 202.159,72.404 	"/><polygon class="st20" points="169.785,55.453 118.761,82.257 93.234,69.099 144.272,42.304 	"/><polygon class="st21" points="93.234,68.933 144.272,42.138 144.272,59.814 110.067,77.775 	"/><polyline class="st22" points="144.272,42.138 144.272,59.814 152.9,64.324 169.785,55.453 	"/><g>		<polygon class="st20" points="266.783,106.064 240.121,120.191 214.6,107.033 241.275,92.916 		"/><polygon class="st21" points="214.6,106.868 241.275,92.748 241.275,110.428 231.425,115.709 		"/><polyline class="st22" points="241.275,92.748 241.275,110.428 249.903,114.936 266.783,106.064 		"/></g>	<g>		<polygon class="st20" points="174.813,153.697 148.15,167.824 122.629,154.666 149.305,140.549 		"/><polygon class="st21" points="122.629,154.502 149.305,140.381 149.305,158.06 139.457,163.344 		"/><polyline class="st22" points="149.305,140.381 149.305,158.06 157.936,162.569 174.813,153.697 		"/></g>	<g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_100_" points="222.363,129.099 195.698,143.228 170.178,130.069 196.853,115.951 												"/></defs>											<clipPath id="SVGID_101_">												<use xlink:href="#SVGID_100_"  style="overflow:visible;"/></clipPath>											<polygon class="st157" points="217.643,129.84 196.861,140.556 176.063,129.84 196.862,119.125 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_102_" points="222.363,129.099 195.698,143.228 170.178,130.069 196.853,115.951 												"/></defs>											<clipPath id="SVGID_103_">												<use xlink:href="#SVGID_102_"  style="overflow:visible;"/></clipPath>											<polygon class="st158" points="217.643,146.283 217.643,129.84 196.861,140.556 196.861,156.48 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>		<g>			<g>				<g>					<g>						<g>							<g>								<g>									<g>										<g>											<defs>												<polygon id="SVGID_104_" points="222.363,129.099 195.698,143.228 170.178,130.069 196.853,115.951 												"/></defs>											<clipPath id="SVGID_105_">												<use xlink:href="#SVGID_104_"  style="overflow:visible;"/></clipPath>											<polygon class="st159" points="196.861,140.556 176.063,129.84 176.063,145.851 196.861,156.48 											"/></g>									</g>								</g>							</g>						</g>					</g>				</g>			</g>		</g>	</g>			<linearGradient id="SVGID_106_" gradientUnits="userSpaceOnUse" x1="-256.755" y1="3395.5476" x2="-256.755" y2="3281.6726" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#CF9115;stop-opacity:0"/><stop  offset="1" style="stop-color:#CF9115"/></linearGradient>	<polygon class="st160" points="217.635,129.842 217.635,0.637 196.855,11.355 196.855,140.556 	"/><linearGradient id="SVGID_107_" gradientUnits="userSpaceOnUse" x1="-277.5005" y1="3396.1775" x2="-277.5005" y2="3282.2676" gradientTransform="matrix(1 0 0 -1 464 3420)">		<stop  offset="0" style="stop-color:#B57902;stop-opacity:0"/><stop  offset="1" style="stop-color:#B57902"/></linearGradient>	<polygon class="st161" points="197.039,10.722 175.96,0 175.96,129.332 197.039,139.963 	"/></g><g id="vagrant-initializes" data-size="291x186" class="nanobox-svg ">	<g>		<polygon class="st162" points="289.819,75.417 147.155,148.951 1.094,74.095 143.757,0.562 		"/><polygon class="st162" points="167.257,91.962 116.92,118.408 91.738,105.425 142.09,78.99 		"/><polyline class="st162" points="123.371,122.154 149.664,108.236 149.664,125.663 139.957,130.871 		"/><line class="st162" x1="149.664" y1="125.663" x2="158.17" y2="130.107"/><line class="st162" x1="174.808" y1="121.363" x2="149.664" y2="108.236"/><polyline class="st162" points="174.808,121.363 148.555,135.136 123.371,122.154 		"/><polyline class="st162" points="168.644,98.716 194.936,84.798 194.936,102.222 185.23,107.432 		"/><line class="st162" x1="194.936" y1="102.222" x2="203.443" y2="106.667"/><line class="st162" x1="220.08" y1="97.923" x2="194.936" y2="84.798"/><polyline class="st162" points="220.08,97.923 193.826,111.699 168.644,98.716 		"/><polyline class="st162" points="213.017,75.277 239.31,61.359 239.31,78.785 229.602,83.993 		"/><line class="st162" x1="239.31" y1="78.785" x2="247.815" y2="83.228"/><line class="st162" x1="264.453" y1="74.486" x2="239.31" y2="61.359"/><polyline class="st162" points="264.453,74.486 238.2,88.259 213.017,75.277 		"/><polyline class="st162" points="142.09,78.826 142.09,96.266 108.343,113.986 		"/><line class="st162" x1="142.09" y1="96.266" x2="150.601" y2="100.712"/><polygon class="st162" points="135.312,75.406 84.977,101.85 59.797,88.868 110.144,62.435 		"/><polyline class="st162" points="110.144,62.268 110.144,79.71 76.398,97.427 		"/><line class="st162" x1="110.144" y1="79.71" x2="118.657" y2="84.154"/><polygon class="st162" points="103.369,58.682 53.034,85.129 27.852,72.146 78.201,45.71 		"/><polyline class="st162" points="78.201,45.544 78.201,62.986 44.454,80.705 		"/><line class="st162" x1="78.201" y1="62.986" x2="86.714" y2="67.431"/><polyline class="st162" points="289.819,75.609 289.819,111.238 147.155,184.771 147.155,149.142 		"/><polyline class="st162" points="1.094,74.097 1.094,109.724 147.155,184.771 		"/><polygon class="st162" points="232.486,57.702 182.151,84.149 156.971,71.165 207.32,44.731 		"/><polyline class="st162" points="207.32,44.565 207.32,62.003 173.574,79.722 		"/><line class="st162" x1="207.32" y1="62.003" x2="215.831" y2="66.45"/><polygon class="st162" points="200.543,41.144 150.208,67.589 125.025,54.605 175.375,28.171 		"/><polyline class="st162" points="175.375,28.007 175.375,45.448 141.628,63.166 		"/><line class="st162" x1="175.375" y1="45.448" x2="183.886" y2="49.892"/><polygon class="st162" points="168.599,24.421 118.264,50.865 93.083,37.882 143.431,11.449 		"/><polyline class="st162" points="143.431,11.284 143.431,28.724 109.686,46.443 		"/><line class="st162" x1="143.431" y1="28.724" x2="151.945" y2="33.167"/></g></g><g id="add-btn" data-size="71x81" class="nanobox-svg ">	<line class="st163" x1="35.049" y1="26.163" x2="35.049" y2="54.999"/><line class="st163" x1="20.631" y1="40.581" x2="49.467" y2="40.581"/><polygon class="st164" points="66.604,58.693 35.051,76.91 3.5,58.693 3.5,22.255 35.051,4.041 66.604,22.258 	"/></g><g id="engine-icon" data-size="71x81" class="nanobox-svg ">	<polygon class="st165" points="13.814,29.151 34.876,41.328 56.227,29.011 56.218,28.161 35.053,15.926 13.817,28.161 	"/><polygon class="st166" points="56.227,52.612 35.012,64.86 34.239,64.397 34.239,40.842 56.227,28.148 	"/><polygon  class="outline st167" points="66.606,58.694 35.053,76.91 3.5,58.694 3.5,22.256 35.053,4.041 66.606,22.259 			"/><polygon class="st168" points="13.817,52.626 34.99,64.829 34.99,40.364 13.817,28.161 	"/></g><g id="close-btn" data-size="20x20" class="nanobox-svg ">	<path class="st169" d="M18.915,17.37c0.221,0.219,0.328,0.48,0.328,0.781c0,0.303-0.107,0.562-0.328,0.781		c-0.219,0.219-0.479,0.322-0.809,0.322c-0.271,0-0.527-0.104-0.771-0.322l-7.688-7.693l-7.732,7.693		c-0.219,0.219-0.469,0.322-0.752,0.322c-0.18,0-0.334-0.023-0.463-0.086c-0.129-0.062-0.252-0.146-0.367-0.236		c-0.219-0.229-0.32-0.479-0.32-0.781c0-0.301,0.104-0.562,0.32-0.781l7.695-7.688L0.333,1.953C0.229,1.849,0.149,1.728,0.104,1.599		C0.042,1.453,0,1.31,0,1.156s0.023-0.301,0.104-0.443c0.059-0.141,0.139-0.27,0.229-0.385C0.562,0.109,0.815,0,1.124,0		c0.312,0,0.572,0.109,0.791,0.328l7.732,7.771l7.688-7.771C17.564,0.109,17.817,0,18.126,0c0.312,0,0.57,0.109,0.789,0.328		c0.104,0.115,0.188,0.244,0.232,0.385c0.051,0.146,0.076,0.289,0.076,0.443s-0.025,0.303-0.076,0.443		c-0.053,0.143-0.129,0.264-0.232,0.354l-7.713,7.729L18.915,17.37z"/></g><g id="logo-horizontal" data-size="166x33" class="nanobox-svg ">	<g  class="logotype" >		<path class="st120" d="M43.137,7.31l8.918,12.938h0.043V7.31h1.458v15.307h-1.629L43.009,9.668h-0.043v12.949h-1.458V7.31H43.137z			"/><path class="st120" d="M66.59,7.31l6.004,15.307h-1.561l-1.865-4.76h-6.964l-1.854,4.76h-1.543L64.962,7.31H66.59z M68.67,16.614			l-2.959-7.847l-3.064,7.847H68.67z"/><path class="st120" d="M79.453,7.31l8.918,12.938h0.043V7.31h1.459v15.307h-1.631L79.324,9.668h-0.043v12.949h-1.457V7.31H79.453z			"/><path class="st120" d="M96.432,11.94c0.301-0.957,0.75-1.812,1.354-2.54c0.6-0.736,1.354-1.321,2.262-1.758			c0.906-0.438,1.961-0.654,3.162-0.654c1.198,0,2.25,0.219,3.146,0.654c0.9,0.437,1.65,1.021,2.252,1.758			c0.604,0.729,1.062,1.583,1.354,2.54c0.301,0.958,0.451,1.966,0.451,3.021c0,1.062-0.15,2.065-0.451,3.022			c-0.299,0.958-0.75,1.801-1.354,2.521c-0.602,0.729-1.352,1.312-2.252,1.747c-0.896,0.438-1.938,0.653-3.146,0.653			s-2.256-0.219-3.162-0.653c-0.908-0.436-1.662-1.019-2.262-1.747c-0.604-0.729-1.062-1.562-1.354-2.521			c-0.301-0.957-0.449-1.979-0.449-3.022S96.133,12.898,96.432,11.94z M97.772,17.418c0.229,0.812,0.564,1.53,1.029,2.166			s1.062,1.146,1.791,1.532c0.729,0.386,1.604,0.579,2.615,0.579s1.883-0.193,2.604-0.579c0.729-0.386,1.314-0.896,1.779-1.532			c0.463-0.636,0.812-1.354,1.027-2.166c0.223-0.807,0.334-1.625,0.334-2.454c0-0.844-0.111-1.665-0.334-2.466			c-0.221-0.8-0.564-1.519-1.027-2.154c-0.465-0.636-1.059-1.146-1.779-1.521c-0.723-0.396-1.592-0.578-2.604-0.578			c-1.016,0-1.887,0.188-2.615,0.578c-0.729,0.387-1.326,0.896-1.791,1.521c-0.465,0.646-0.809,1.354-1.029,2.154			c-0.221,0.801-0.332,1.622-0.332,2.466C97.44,15.793,97.551,16.611,97.772,17.418z"/><path class="st120" d="M123.016,7.31c0.646,0,1.262,0.061,1.854,0.182c0.594,0.122,1.104,0.329,1.562,0.622			c0.449,0.293,0.812,0.679,1.082,1.157c0.271,0.479,0.408,1.062,0.408,1.789c0,0.396-0.064,0.771-0.193,1.17			c-0.129,0.379-0.311,0.722-0.547,1.021c-0.229,0.312-0.514,0.567-0.836,0.782c-0.322,0.214-0.684,0.364-1.082,0.45v0.043			c0.984,0.128,1.771,0.521,2.357,1.211c0.586,0.679,0.879,1.519,0.879,2.52c0,0.243-0.021,0.521-0.064,0.825			c-0.043,0.312-0.129,0.621-0.258,0.943c-0.127,0.312-0.312,0.64-0.557,0.954c-0.244,0.312-0.568,0.589-0.98,0.812			c-0.406,0.232-0.906,0.438-1.5,0.575c-0.594,0.146-1.305,0.229-2.133,0.229h-6.479V7.308h6.479v0.021L123.016,7.31L123.016,7.31z			 M123.016,14.02c0.586,0,1.094-0.067,1.521-0.204c0.43-0.146,0.785-0.321,1.061-0.562c0.287-0.229,0.5-0.512,0.646-0.82			c0.143-0.312,0.215-0.646,0.215-1.013c0-1.915-1.15-2.873-3.451-2.873h-5.018v5.479L123.016,14.02L123.016,14.02z M123.016,21.374			c0.543,0,1.062-0.047,1.543-0.14c0.486-0.104,0.914-0.271,1.287-0.504c0.371-0.243,0.664-0.568,0.879-0.979			c0.213-0.407,0.32-0.918,0.32-1.532c0-0.979-0.346-1.727-1.039-2.219c-0.693-0.493-1.689-0.74-2.99-0.74h-5.018v6.11			L123.016,21.374L123.016,21.374z"/><path class="st120" d="M134.336,11.94c0.299-0.957,0.75-1.812,1.35-2.54c0.605-0.736,1.355-1.321,2.271-1.758			c0.896-0.438,1.961-0.654,3.16-0.654c1.188,0,2.252,0.219,3.145,0.654c0.9,0.437,1.65,1.021,2.25,1.758			c0.605,0.729,1.051,1.583,1.355,2.54c0.301,0.958,0.438,1.966,0.438,3.021c0,1.062-0.145,2.065-0.438,3.022			c-0.312,0.958-0.75,1.801-1.355,2.521c-0.6,0.729-1.35,1.312-2.25,1.747c-0.895,0.438-1.951,0.653-3.145,0.653			c-1.199,0-2.271-0.219-3.16-0.653c-0.908-0.436-1.662-1.019-2.271-1.747c-0.6-0.729-1.051-1.562-1.35-2.521			c-0.301-0.957-0.451-1.979-0.451-3.022S134.035,12.898,134.336,11.94z M135.674,17.418c0.223,0.812,0.564,1.53,1.029,2.166			s1.061,1.146,1.791,1.532c0.729,0.386,1.6,0.579,2.613,0.579c1.016,0,1.885-0.193,2.604-0.579s1.312-0.896,1.779-1.532			c0.465-0.636,0.807-1.354,1.02-2.166c0.23-0.807,0.334-1.625,0.334-2.454c0-0.844-0.104-1.665-0.334-2.466			c-0.221-0.8-0.561-1.519-1.02-2.154c-0.465-0.635-1.062-1.146-1.779-1.521c-0.723-0.396-1.59-0.578-2.604-0.578			c-1.021,0-1.896,0.188-2.613,0.578c-0.73,0.387-1.326,0.896-1.791,1.521c-0.465,0.646-0.812,1.354-1.029,2.154			c-0.221,0.801-0.332,1.622-0.332,2.466C135.342,15.793,135.453,16.611,135.674,17.418z"/><path class="st120" d="M154.68,7.31l4.33,6.396l4.48-6.396h1.629l-5.23,7.46l5.531,7.847h-1.758l-4.652-6.753l-4.717,6.753h-1.629			l5.479-7.891l-5.188-7.416L154.68,7.31L154.68,7.31z"/></g>	<g>		<polygon class="st170" points="18.959,25.987 9.591,30.815 0,25.9 9.368,21.072 		"/><polygon class="st171" points="15.003,23.96 9.498,26.797 3.863,23.91 9.368,21.072 		"/><polygon class="st22" points="9.591,30.828 18.959,26 18.959,27.378 9.591,32.207 		"/><polygon class="st21" points="9.591,30.828 0,25.9 0,27.279 9.591,32.207 		"/></g>	<g>		<polygon class="st24" points="9.687,23.017 17.325,19.079 17.325,20.228 9.687,24.165 		"/><polygon class="st25" points="9.687,23.017 2.049,19.079 2.049,20.228 9.687,24.165 		"/><polygon class="st26" points="17.325,19.079 9.687,23.017 2.049,19.079 9.687,15.142 		"/><polygon class="st27" points="15.31,18.046 9.687,20.945 4.063,18.046 9.687,15.147 		"/></g>	<g>		<polygon class="st28" points="9.687,16.895 18.941,12.127 18.941,13.517 9.687,18.287 		"/><polygon class="st29" points="9.687,16.895 0.432,12.127 0.432,13.517 9.687,18.287 		"/><polygon class="st30" points="18.941,12.127 9.687,16.895 0.432,12.127 9.687,7.355 		"/><polygon class="st31" points="16.501,10.873 9.687,14.386 2.873,10.873 9.687,7.361 		"/></g>	<g>		<polygon class="st172" points="18.94,4.803 9.623,9.604 0.305,4.803 9.623,0 		"/><polygon class="st173" points="9.623,9.604 18.94,4.803 18.94,6.203 9.623,11.006 		"/><polygon class="st174" points="9.623,9.604 0.305,4.803 0.305,6.203 9.623,11.006 		"/></g></g><g id="sandwich" data-size="556x505" class="nanobox-svg ">	<g>		<polygon class="st19" points="458.834,407.293 312.007,482.976 161.687,405.937 308.509,330.256 		"/><polygon class="st20" points="332.699,424.321 280.89,451.544 254.976,438.177 306.793,410.974 		"/><polygon class="st21" points="254.976,438.013 306.793,410.801 306.793,428.755 272.058,446.991 		"/><polyline class="st22" points="306.793,410.801 306.793,428.755 315.552,433.327 332.699,424.321 		"/><polygon class="st20" points="299.822,407.284 248.011,434.505 222.097,421.144 273.914,393.935 		"/><polygon class="st21" points="222.097,420.969 273.914,393.758 273.914,411.713 239.185,429.947 		"/><polyline class="st22" points="273.914,393.758 273.914,411.713 282.679,416.287 299.822,407.284 		"/><polygon class="st20" points="266.945,390.071 215.136,417.289 189.222,403.928 241.039,376.722 		"/><polygon class="st21" points="189.222,403.76 241.039,376.548 241.039,394.502 206.306,412.736 		"/><polyline class="st22" points="241.039,376.548 241.039,394.502 249.798,399.075 266.945,390.071 		"/><polygon class="st22" points="312.007,482.876 458.834,407.198 458.834,428.808 312.007,504.486 		"/><polygon class="st21" points="312.007,482.876 161.687,405.64 161.687,427.251 312.007,504.486 		"/><polygon class="st20" points="415.47,415.203 347.173,450.724 321.263,437.364 389.568,401.855 		"/><polygon class="st21" points="321.279,437.357 406.695,392.697 406.695,410.648 338.511,446.267 		"/><polygon class="st20" points="399.832,389.062 348.027,416.284 322.113,402.92 373.929,375.708 		"/><polygon class="st21" points="322.113,402.748 373.929,375.548 373.929,393.491 339.195,411.726 		"/><polyline class="st22" points="373.929,375.548 373.929,393.491 382.689,398.068 399.832,389.062 		"/><polygon class="st20" points="366.951,372.022 315.148,399.239 289.23,385.875 341.048,358.672 		"/><polygon class="st21" points="289.23,385.707 341.048,358.501 341.048,376.454 306.32,394.683 		"/><polyline class="st22" points="341.048,358.501 341.048,376.454 349.812,381.026 366.951,372.022 		"/><polygon class="st20" points="334.078,354.81 282.273,382.027 256.353,368.667 308.175,341.458 		"/><polygon class="st21" points="256.353,368.497 308.175,341.292 308.175,359.238 273.443,377.475 		"/><polyline class="st22" points="308.175,341.292 308.175,359.238 316.935,363.819 334.078,354.81 		"/><g>			<polyline class="st22" points="406.666,392.678 406.666,410.629 415.431,415.209 432.568,406.2 			"/></g>		<g>			<polygon class="st20" points="339.185,454.566 312.113,468.911 286.199,455.55 313.283,441.214 			"/><polygon class="st21" points="286.199,455.382 313.283,441.044 313.283,458.993 303.283,464.361 			"/><polyline class="st22" points="313.283,441.044 313.283,458.993 322.046,463.571 339.185,454.566 			"/></g>		<polygon class="st23" points="415.316,385.303 308.519,440.349 201.722,385.303 308.519,330.256 		"/></g>	<polygon class="st26" points="329.63,264.14 278.046,291.241 252.242,277.937 303.839,250.847 	"/><polygon class="st24" points="329.63,284.549 329.63,264.14 278.046,291.241 278.046,311.004 	"/><polygon class="st25" points="278.046,291.241 252.242,277.937 252.242,297.809 278.046,311.004 	"/><polygon class="st26" points="268.638,296.022 217.054,323.123 191.246,309.819 242.847,282.729 	"/><polygon class="st26" points="362.369,281.278 310.785,308.379 284.978,295.074 336.576,267.984 	"/><polygon class="st24" points="362.369,301.688 362.369,281.28 310.785,308.379 310.783,328.142 	"/><polygon class="st25" points="310.785,308.379 284.978,295.074 284.978,314.947 310.783,328.142 	"/><polygon class="st26" points="395.105,298.416 343.521,325.517 317.712,312.212 369.314,285.122 	"/><polygon class="st24" points="395.105,318.825 395.105,298.418 343.521,325.517 343.521,345.28 	"/><polygon class="st25" points="343.521,325.517 317.712,312.212 317.712,332.085 343.521,345.28 	"/><polygon class="st24" points="268.638,316.431 268.638,296.024 217.054,323.123 217.052,342.886 	"/><polygon class="st25" points="217.054,323.123 191.246,309.819 191.246,329.692 217.052,342.886 	"/><polygon class="st26" points="301.373,313.16 249.789,340.262 223.984,326.957 275.582,299.866 	"/><polygon class="st24" points="301.373,333.57 301.373,313.161 249.789,340.262 249.787,360.025 	"/><polygon class="st25" points="249.789,340.262 223.984,326.957 223.984,346.829 249.787,360.025 	"/><polygon class="st26" points="334.111,330.298 282.527,357.4 256.72,344.095 308.32,317.005 	"/><polygon class="st24" points="334.111,350.708 334.111,330.3 282.527,357.4 282.527,377.162 	"/><polygon class="st25" points="282.527,357.4 256.72,344.095 256.72,363.968 282.527,377.162 	"/><g>		<polygon class="st26" points="426.412,312.194 341.074,356.927 319.957,346.048 405.314,301.314 		"/><polygon class="st24" points="426.412,332.073 426.412,312.194 341.074,356.927 341.074,376.28 		"/><polygon class="st25" points="341.074,356.927 319.957,346.048 319.957,365.488 341.074,376.28 		"/></g>	<g>		<polygon class="st27" points="414.898,306.256 315.152,358.262 305.632,353.369 297.951,357.34 297.92,349.334 272.164,335.988 			264.988,339.711 264.992,332.273 239.257,318.939 232.119,322.685 232.086,315.225 206.318,301.872 242.845,282.724 			252.271,287.551 252.242,277.937 303.535,250.905 362.369,281.265 362.392,288.703 369.316,285.119 377.218,289.197 			395.105,298.416 395.111,306.648 405.314,301.314 		"/><polygon class="st175" points="333.045,380.89 333.045,361.012 332.074,360.511 311.947,370.889 311.947,391.243 		"/><polygon class="st176" points="311.947,370.889 291.796,360.511 290.828,361.012 290.828,380.452 311.947,391.243 		"/><polygon class="st177" points="333.045,361.012 311.947,371.89 290.828,361.012 311.947,350.13 		"/></g>	<polyline class="st178" points="332.492,361.256 332.492,307.496 458.455,242.631 458.455,211.852 	"/><polyline class="st178" points="290.478,361.256 290.478,307.496 168.752,244.751 168.752,211.852 	"/><polygon class="st28" points="313.513,264.806 458.564,190.041 458.564,211.852 313.513,286.614 	"/><polygon class="st29" points="313.513,264.806 168.461,190.041 168.461,211.852 313.513,286.614 	"/><polygon class="st30" points="458.564,190.041 313.513,264.806 168.461,190.041 313.513,115.278 	"/><polygon class="st31" points="420.31,170.417 313.513,225.462 206.714,170.417 313.513,115.37 	"/><g>		<polygon class="st17" points="312.507,149.538 457.566,74.771 458.537,75.272 458.537,97.229 312.507,172.496 		"/><polygon class="st18" points="312.507,149.538 167.449,74.771 166.478,75.272 166.478,97.229 312.507,172.496 		"/><polygon class="st15" points="458.537,75.272 312.507,150.539 166.478,75.272 312.507,0 		"/><polygon class="st115" points="230.638,63.035 201.574,77.996 196.392,75.269 225.459,60.306 		"/><polygon class="st16" points="261.734,56.51 220.832,77.592 215.654,74.865 256.554,53.78 		"/><polygon class="st16" points="270.972,61.274 230.074,82.354 224.892,79.626 265.793,58.544 		"/><polygon class="st16" points="280.211,66.032 239.314,87.117 234.13,84.39 275.033,63.306 		"/><polygon class="st115" points="272.822,84.797 243.755,99.758 238.576,97.032 267.644,82.071 		"/><polygon class="st16" points="303.918,78.274 263.019,99.356 257.838,96.629 298.74,75.544 		"/><polygon class="st16" points="313.158,83.037 272.255,104.119 267.076,101.39 307.978,80.309 		"/><polygon class="st16" points="322.398,87.798 281.496,108.881 276.316,106.153 317.216,85.071 		"/><polygon class="st115" points="313.543,105.784 284.478,120.744 279.296,118.02 308.365,103.056 		"/><polygon class="st16" points="344.64,99.261 303.74,120.343 298.558,117.615 339.459,96.53 		"/><polygon class="st16" points="353.879,104.025 312.98,125.107 307.796,122.377 348.699,101.297 		"/><polygon class="st16" points="363.117,108.785 322.216,129.865 317.037,127.14 357.939,106.056 		"/><polygon class="st115" points="295.935,29.699 266.871,44.662 261.691,41.934 290.754,26.972 		"/><polygon class="st16" points="327.033,23.176 286.129,44.258 280.951,41.53 321.853,20.447 		"/><polygon class="st16" points="336.269,27.94 295.371,49.02 290.191,46.292 331.089,25.21 		"/><polygon class="st16" points="345.507,32.698 304.611,53.782 299.429,51.056 340.33,29.971 		"/><polygon class="st115" points="338.119,51.463 309.054,66.424 303.873,63.698 332.943,48.736 		"/><polygon class="st16" points="369.216,44.94 328.318,66.022 323.136,63.294 364.035,42.211 		"/><polygon class="st16" points="378.455,49.703 337.554,70.785 332.373,68.056 373.275,46.976 		"/><polygon class="st16" points="387.695,54.464 346.793,75.544 341.615,72.819 382.515,51.737 		"/><polygon class="st115" points="378.839,72.447 349.775,87.41 344.595,84.684 373.662,69.722 		"/><polygon class="st16" points="409.939,65.928 369.037,87.01 363.857,84.28 404.755,63.197 		"/><polygon class="st16" points="419.177,70.69 378.277,91.773 373.095,89.043 413.996,67.963 		"/><polygon class="st16" points="428.416,75.451 387.517,96.53 382.334,93.806 423.238,72.722 		"/></g>	<g id="arrows" class="nanobox-svg ">		<g>			<g>				<polyline class="st179" points="1.994,124.803 39.777,87.021 149.375,87.021 				"/><g>					<path class="st180" d="M148.974,87.021c-1.045-1.045-1.543-3.104-1.584-4.545c1.432,1.925,3.293,3.604,5.547,4.545						c-2.254,0.901-4.033,2.688-5.547,4.545C147.513,90.03,147.888,88.167,148.974,87.021z"/></g>			</g>		</g>		<g>			<g>				<polyline class="st179" points="0,282.217 26.576,282.217 108.035,200.758 149.375,200.758 				"/><g>					<path class="st180" d="M148.974,200.758c-1.045-1.045-1.543-3.111-1.584-4.545c1.432,1.925,3.293,3.604,5.547,4.545						c-2.254,0.901-4.033,2.682-5.547,4.545C147.513,203.768,147.888,201.905,148.974,200.758z"/></g>			</g>		</g>		<g>			<g>				<polyline class="st179" points="555.423,360.639 497.986,418.074 476.55,418.074 				"/><g>					<path class="st180" d="M476.953,418.074c1.045,1.045,1.543,3.104,1.584,4.545c-1.434-1.938-3.295-3.604-5.547-4.545						c2.252-0.901,4.031-2.688,5.547-4.562C478.414,415.065,478.039,416.928,476.953,418.074z"/></g>			</g>		</g>		<g>			<g>				<polyline class="st179" points="555.222,245.842 476.988,324.076 441.55,324.076 				"/><g>					<path class="st180" d="M441.953,324.076c1.045,1.045,1.543,3.104,1.584,4.545c-1.434-1.925-3.295-3.604-5.547-4.545						c2.252-0.901,4.031-2.688,5.547-4.545C443.414,321.067,443.039,322.93,441.953,324.076z"/></g>			</g>		</g>	</g>	<g id="numbers-staggered" class="nanobox-svg ">		<g class="st50">			<path class="st15" d="M147.024,90.267h3.1l1.23-10.05l0.18-0.77l-2.93,2.29c-0.12,0.093-0.247,0.14-0.38,0.14				c-0.1,0-0.19-0.021-0.27-0.065c-0.08-0.043-0.137-0.091-0.17-0.145l-0.44-0.75l4.7-3.69h1.4l-1.6,13.04h2.84l-0.16,1.32h-7.65				L147.024,90.267z"/></g>		<g class="st50">			<path class="st30" d="M149.734,192.11c0.553,0,1.065,0.078,1.535,0.234c0.47,0.157,0.875,0.386,1.215,0.686				c0.34,0.3,0.605,0.665,0.795,1.095s0.285,0.919,0.285,1.465c0,0.607-0.095,1.16-0.285,1.66s-0.448,0.974-0.775,1.42				c-0.327,0.447-0.708,0.88-1.145,1.3s-0.902,0.854-1.395,1.301l-4.31,3.92c0.273-0.073,0.547-0.13,0.82-0.17				c0.273-0.04,0.537-0.061,0.79-0.061h4.9c0.173,0,0.307,0.047,0.4,0.14c0.093,0.094,0.14,0.217,0.14,0.37				c0,0.067-0.007,0.157-0.02,0.271c-0.014,0.113-0.027,0.217-0.04,0.31l-0.07,0.53h-9.52l0.07-0.59				c0.013-0.113,0.053-0.238,0.12-0.375c0.066-0.137,0.16-0.259,0.28-0.365l5.18-4.63c0.486-0.434,0.92-0.845,1.3-1.235				c0.38-0.39,0.702-0.776,0.965-1.16c0.264-0.383,0.463-0.774,0.6-1.175c0.137-0.399,0.205-0.83,0.205-1.29				c0-0.359-0.059-0.676-0.175-0.949c-0.117-0.273-0.279-0.5-0.485-0.681c-0.207-0.18-0.452-0.316-0.735-0.41				c-0.283-0.093-0.592-0.14-0.925-0.14c-0.747,0-1.382,0.195-1.905,0.585s-0.908,0.925-1.155,1.605				c-0.074,0.193-0.168,0.329-0.285,0.409s-0.258,0.12-0.425,0.12c-0.034,0-0.07-0.001-0.11-0.005				c-0.04-0.003-0.08-0.008-0.12-0.015l-0.87-0.15c0.167-0.653,0.415-1.229,0.745-1.729s0.718-0.92,1.165-1.261				c0.446-0.34,0.945-0.596,1.495-0.77C148.539,192.197,149.12,192.11,149.734,192.11z"/></g>		<g class="st50">			<path class="st26" d="M442.587,315.652c0.56,0,1.071,0.076,1.534,0.229c0.464,0.153,0.859,0.372,1.186,0.655				s0.58,0.625,0.76,1.025c0.18,0.399,0.271,0.843,0.271,1.329c0,0.527-0.07,0.992-0.21,1.396c-0.141,0.403-0.338,0.755-0.596,1.055				c-0.256,0.3-0.566,0.549-0.93,0.745c-0.363,0.197-0.768,0.355-1.215,0.476c0.813,0.233,1.426,0.608,1.835,1.125				c0.41,0.517,0.615,1.148,0.615,1.895c0,0.72-0.144,1.368-0.431,1.945c-0.286,0.576-0.673,1.069-1.16,1.479				c-0.486,0.41-1.051,0.726-1.694,0.945s-1.318,0.33-2.024,0.33c-0.668,0-1.25-0.077-1.75-0.23s-0.928-0.383-1.281-0.689				c-0.353-0.307-0.639-0.693-0.859-1.16c-0.22-0.467-0.383-1.017-0.49-1.65l0.801-0.3c0.146-0.053,0.279-0.08,0.399-0.08				c0.126,0,0.235,0.027,0.325,0.08c0.09,0.054,0.151,0.134,0.186,0.24c0.105,0.387,0.232,0.725,0.379,1.015s0.33,0.532,0.551,0.726				c0.22,0.193,0.482,0.338,0.789,0.435s0.678,0.146,1.111,0.146c0.546,0,1.033-0.094,1.459-0.28c0.427-0.187,0.785-0.43,1.075-0.73				c0.29-0.3,0.512-0.64,0.665-1.02s0.23-0.767,0.23-1.16c0-0.32-0.051-0.615-0.15-0.885c-0.1-0.271-0.279-0.504-0.54-0.7				c-0.26-0.196-0.61-0.352-1.05-0.465s-1-0.17-1.68-0.17l0.16-1.25c1.266,0,2.209-0.26,2.83-0.778				c0.619-0.519,0.93-1.227,0.93-2.123c0-0.355-0.057-0.666-0.17-0.934c-0.113-0.269-0.273-0.491-0.48-0.668				c-0.207-0.178-0.45-0.31-0.73-0.396c-0.279-0.087-0.586-0.131-0.92-0.131c-0.76,0-1.399,0.196-1.92,0.59				c-0.52,0.394-0.906,0.927-1.16,1.601c-0.072,0.193-0.168,0.329-0.285,0.409c-0.116,0.08-0.254,0.12-0.414,0.12				c-0.033,0-0.068-0.001-0.105-0.005c-0.037-0.003-0.072-0.008-0.105-0.015l-0.879-0.15c0.166-0.653,0.414-1.229,0.744-1.729				s0.719-0.92,1.166-1.261c0.445-0.34,0.943-0.596,1.489-0.77C441.393,315.738,441.972,315.652,442.587,315.652z"/></g>		<g class="st50">			<path class="st181" d="M480.582,420.965h2.17l-0.14,0.979c-0.014,0.101-0.056,0.187-0.125,0.26				c-0.07,0.074-0.172,0.11-0.306,0.11h-1.77l-0.46,3.79h-1.56l0.47-3.79h-6.3c-0.134,0-0.257-0.036-0.37-0.11				c-0.114-0.073-0.177-0.166-0.19-0.279l-0.06-0.87l8.11-9.28h1.66L480.582,420.965z M479.771,414.935				c0.014-0.16,0.041-0.332,0.08-0.515c0.041-0.184,0.088-0.372,0.141-0.565l-6.15,7.11h5.18L479.771,414.935z"/></g>	</g>	<g id="numbers-vertical" class="nanobox-svg ">		<g class="st50">			<path class="st15" d="M147.024,90.267h3.1l1.23-10.05l0.18-0.77l-2.93,2.29c-0.12,0.093-0.247,0.14-0.38,0.14				c-0.1,0-0.19-0.021-0.27-0.065c-0.08-0.043-0.137-0.091-0.17-0.145l-0.44-0.75l4.7-3.69h1.4l-1.6,13.04h2.84l-0.16,1.32h-7.65				L147.024,90.267z"/></g>		<g class="st50">			<path class="st30" d="M149.734,192.11c0.553,0,1.065,0.078,1.535,0.234c0.47,0.157,0.875,0.386,1.215,0.686				c0.34,0.3,0.605,0.665,0.795,1.095s0.285,0.919,0.285,1.465c0,0.607-0.095,1.16-0.285,1.66s-0.448,0.974-0.775,1.42				c-0.327,0.447-0.708,0.88-1.145,1.3s-0.902,0.854-1.395,1.301l-4.31,3.92c0.273-0.073,0.547-0.13,0.82-0.17				c0.273-0.04,0.537-0.061,0.79-0.061h4.9c0.173,0,0.307,0.047,0.4,0.14c0.093,0.094,0.14,0.217,0.14,0.37				c0,0.067-0.007,0.157-0.02,0.271c-0.014,0.113-0.027,0.217-0.04,0.31l-0.07,0.53h-9.52l0.07-0.59				c0.013-0.113,0.053-0.238,0.12-0.375c0.066-0.137,0.16-0.259,0.28-0.365l5.18-4.63c0.486-0.434,0.92-0.845,1.3-1.235				c0.38-0.39,0.702-0.776,0.965-1.16c0.264-0.383,0.463-0.774,0.6-1.175c0.137-0.399,0.205-0.83,0.205-1.29				c0-0.359-0.059-0.676-0.175-0.949c-0.117-0.273-0.279-0.5-0.485-0.681c-0.207-0.18-0.452-0.316-0.735-0.41				c-0.283-0.093-0.592-0.14-0.925-0.14c-0.747,0-1.382,0.195-1.905,0.585s-0.908,0.925-1.155,1.605				c-0.074,0.193-0.168,0.329-0.285,0.409s-0.258,0.12-0.425,0.12c-0.034,0-0.07-0.001-0.11-0.005				c-0.04-0.003-0.08-0.008-0.12-0.015l-0.87-0.15c0.167-0.653,0.415-1.229,0.745-1.729s0.718-0.92,1.165-1.261				c0.446-0.34,0.945-0.596,1.495-0.77C148.539,192.197,149.12,192.11,149.734,192.11z"/></g>		<g class="st50">			<path class="st26" d="M150.469,303.1c0.56,0,1.071,0.076,1.535,0.229s0.858,0.372,1.185,0.655s0.58,0.625,0.76,1.025				c0.18,0.399,0.27,0.843,0.27,1.329c0,0.527-0.07,0.992-0.21,1.396c-0.14,0.403-0.338,0.755-0.595,1.055s-0.567,0.549-0.93,0.745				c-0.363,0.197-0.768,0.355-1.215,0.476c0.813,0.233,1.425,0.608,1.835,1.125c0.41,0.517,0.615,1.148,0.615,1.895				c0,0.72-0.144,1.368-0.43,1.945c-0.287,0.576-0.673,1.069-1.16,1.479c-0.486,0.41-1.051,0.726-1.695,0.945				s-1.318,0.33-2.025,0.33c-0.667,0-1.25-0.077-1.75-0.23s-0.927-0.383-1.28-0.689c-0.353-0.307-0.64-0.693-0.86-1.16				c-0.22-0.467-0.383-1.017-0.49-1.65l0.8-0.3c0.146-0.053,0.28-0.08,0.4-0.08c0.126,0,0.235,0.027,0.325,0.08				c0.09,0.054,0.151,0.134,0.185,0.24c0.106,0.387,0.233,0.725,0.38,1.015c0.146,0.29,0.33,0.532,0.55,0.726				c0.22,0.193,0.483,0.338,0.79,0.435s0.677,0.146,1.11,0.146c0.546,0,1.033-0.094,1.46-0.28c0.426-0.187,0.785-0.43,1.075-0.73				c0.29-0.3,0.512-0.64,0.665-1.02s0.23-0.767,0.23-1.16c0-0.32-0.05-0.615-0.15-0.885c-0.1-0.271-0.28-0.504-0.54-0.7				c-0.26-0.196-0.61-0.352-1.05-0.465s-1-0.17-1.68-0.17l0.16-1.25c1.267,0,2.21-0.26,2.83-0.778c0.62-0.519,0.93-1.227,0.93-2.123				c0-0.355-0.057-0.666-0.17-0.934c-0.113-0.269-0.273-0.491-0.48-0.668c-0.207-0.178-0.45-0.31-0.73-0.396				s-0.587-0.131-0.92-0.131c-0.76,0-1.4,0.196-1.92,0.59s-0.907,0.927-1.16,1.601c-0.073,0.193-0.168,0.329-0.285,0.409				s-0.255,0.12-0.415,0.12c-0.033,0-0.068-0.001-0.105-0.005c-0.037-0.003-0.072-0.008-0.105-0.015l-0.88-0.15				c0.167-0.653,0.415-1.229,0.745-1.729s0.718-0.92,1.165-1.261c0.446-0.34,0.943-0.596,1.49-0.77				C149.276,303.187,149.856,303.1,150.469,303.1z"/></g>		<g class="st50">			<path class="st182" d="M151.195,412.958h2.17l-0.14,0.979c-0.014,0.101-0.055,0.187-0.125,0.26				c-0.07,0.074-0.172,0.11-0.305,0.11h-1.77l-0.46,3.79h-1.56l0.47-3.79h-6.3c-0.133,0-0.256-0.036-0.37-0.11				c-0.114-0.073-0.177-0.166-0.19-0.279l-0.06-0.87l8.11-9.28h1.66L151.195,412.958z M150.385,406.928				c0.014-0.16,0.04-0.332,0.08-0.515c0.04-0.184,0.087-0.372,0.14-0.565l-6.15,7.11h5.18L150.385,406.928z"/></g>	</g></g><g id="push-pagoda" data-size="312x215" class="nanobox-svg ">			<use xlink:href="#mini-stack_1_"  width="87.77" height="149.102" x="-43.885" y="-74.551" transform="matrix(1 0 0 -1 45.3433 89.5335)" style="overflow:visible;"/><circle class="st183" cx="220.506" cy="81.502" r="81.002"/><polygon class="st184" points="198.849,53.11 181.147,63.026 178.082,85.168 202.366,131.547 202.355,131.542 225.799,145.899 		225.799,69.618 	"/><polygon class="st185" points="213.239,27.516 192.09,48.974 225.799,69.618 256.524,50.596 	"/><polygon class="st186" points="198.849,53.11 225.799,87.197 237.452,62.402 	"/><polygon class="st187" points="213.239,27.516 198.849,53.11 181.147,63.026 192.09,48.974 	"/><polygon class="st188" points="256.524,50.596 256.524,50.596 225.799,87.706 225.799,145.899 270.598,75.647 	"/><polygon class="st189" points="225.799,87.197 202.366,101.451 202.366,131.547 225.799,145.899 236.958,106.392 	"/><polygon class="st190" points="237.452,62.402 256.524,50.596 270.598,75.647 236.958,106.392 225.799,87.197 	"/><polygon class="st191" points="202.366,131.547 225.799,87.197 202.366,101.451 	"/><polyline class="st192" points="198.849,53.11 202.366,101.451 225.799,87.197 	"/><polygon class="st193" points="213.239,27.516 198.849,53.11 181.147,63.026 192.09,48.974 	"/><g class="st50">		<path class="st115" d="M4.878,200.669c0.141,0.023,0.286,0.056,0.435,0.097s0.309,0.091,0.479,0.149			c0.064-0.129,0.151-0.227,0.259-0.295c0.108-0.066,0.245-0.101,0.409-0.101c0.287,0,0.489,0.072,0.606,0.216			s0.179,0.402,0.185,0.777l0.018,1.081v0.053c0,0.293-0.081,0.516-0.242,0.668s-0.397,0.229-0.708,0.229			c-0.193,0-0.344-0.038-0.453-0.114s-0.227-0.24-0.356-0.492c-0.152-0.299-0.362-0.527-0.628-0.686s-0.567-0.237-0.901-0.237			c-0.48,0-0.855,0.101-1.125,0.304c-0.27,0.201-0.404,0.479-0.404,0.83c0,0.27,0.079,0.488,0.237,0.654			c0.158,0.168,0.521,0.365,1.09,0.594l1.635,0.624c0.809,0.322,1.38,0.693,1.714,1.112s0.501,0.968,0.501,1.647			c0,0.967-0.277,1.707-0.831,2.22s-1.355,0.769-2.404,0.769H4.342l-0.114,1.925c-0.018,0.264-0.094,0.455-0.229,0.576			c-0.135,0.119-0.346,0.18-0.633,0.18c-0.24,0-0.415-0.056-0.523-0.167s-0.163-0.296-0.163-0.554v-0.141l0.132-2.039			c-0.199-0.035-0.398-0.086-0.598-0.154c-0.199-0.066-0.404-0.153-0.615-0.259c-0.088,0.117-0.186,0.201-0.294,0.251			s-0.268,0.074-0.479,0.074c-0.316,0-0.533-0.077-0.65-0.232S0,209.789,0,209.379v-1.063c0-0.381,0.07-0.656,0.211-0.826			s0.363-0.255,0.668-0.255c0.457,0,0.776,0.246,0.958,0.738c0.047,0.123,0.082,0.214,0.105,0.272			c0.129,0.275,0.378,0.496,0.747,0.664c0.369,0.166,0.794,0.25,1.274,0.25c0.434,0,0.772-0.098,1.015-0.295			c0.243-0.195,0.365-0.47,0.365-0.821c0-0.469-0.51-0.899-1.529-1.292l-0.053-0.018l-1.617-0.633			c-0.639-0.24-1.116-0.584-1.433-1.033c-0.316-0.447-0.475-0.997-0.475-1.647c0-0.879,0.256-1.557,0.769-2.034			s1.276-0.746,2.29-0.805l0.07-0.703c0.018-0.234,0.097-0.413,0.237-0.536s0.331-0.185,0.571-0.185			c0.246,0,0.437,0.055,0.571,0.162c0.135,0.109,0.202,0.263,0.202,0.462v0.114L4.878,200.669z"/><path class="st115" d="M29.18,209.309h0.114c0.328,0,0.574,0.081,0.738,0.241c0.164,0.162,0.246,0.403,0.246,0.726			c0,0.346-0.083,0.595-0.25,0.747s-0.45,0.229-0.848,0.229h-2.162c-0.393,0-0.675-0.076-0.848-0.229s-0.259-0.401-0.259-0.747			c0-0.322,0.083-0.563,0.25-0.726c0.167-0.16,0.417-0.241,0.751-0.241h0.105v-2.54c0-0.703-0.098-1.202-0.294-1.498			s-0.523-0.444-0.98-0.444c-0.486,0-0.883,0.178-1.191,0.532s-0.461,0.824-0.461,1.41v2.54h0.105c0.334,0,0.583,0.081,0.747,0.241			c0.164,0.162,0.246,0.403,0.246,0.726c0,0.346-0.085,0.595-0.255,0.747s-0.451,0.229-0.844,0.229h-2.18			c-0.393,0-0.674-0.076-0.844-0.229s-0.255-0.401-0.255-0.747c0-0.322,0.082-0.563,0.246-0.726c0.164-0.16,0.413-0.241,0.747-0.241			h0.105v-4.254h-0.149c-0.316,0-0.557-0.08-0.721-0.241s-0.246-0.397-0.246-0.708c0-0.346,0.085-0.595,0.255-0.747			s0.457-0.229,0.861-0.229h1.494c0.164,0,0.289,0.032,0.374,0.097s0.127,0.158,0.127,0.281v0.686			c0.27-0.422,0.614-0.739,1.033-0.954c0.419-0.213,0.904-0.32,1.455-0.32c0.938,0,1.636,0.284,2.096,0.853s0.69,1.436,0.69,2.602			V209.309z"/><path class="st115" d="M39.876,209.326h0.141c0.316,0,0.558,0.083,0.725,0.251c0.167,0.166,0.25,0.405,0.25,0.716			c0,0.34-0.086,0.585-0.259,0.733c-0.173,0.15-0.458,0.225-0.857,0.225H39.05c-0.293,0-0.511-0.056-0.655-0.167			s-0.262-0.313-0.356-0.606c-0.486,0.322-1.002,0.568-1.547,0.738s-1.096,0.255-1.652,0.255c-0.943,0-1.685-0.234-2.224-0.703			s-0.809-1.11-0.809-1.925c0-0.879,0.349-1.562,1.046-2.048s1.676-0.729,2.936-0.729c0.281,0,0.58,0.015,0.896,0.044			s0.671,0.076,1.063,0.141v-0.167c0-0.527-0.127-0.929-0.382-1.204s-0.631-0.413-1.129-0.413c-0.387,0-0.88,0.144-1.481,0.431			s-1.042,0.431-1.323,0.431c-0.275,0-0.498-0.08-0.668-0.242c-0.17-0.16-0.255-0.373-0.255-0.637c0-0.475,0.347-0.851,1.042-1.129			s1.639-0.418,2.834-0.418c1.248,0,2.142,0.24,2.681,0.721s0.809,1.295,0.809,2.443V209.326z M37.749,207.63			c-0.293-0.064-0.562-0.112-0.809-0.145s-0.475-0.049-0.686-0.049c-0.645,0-1.15,0.108-1.516,0.325s-0.549,0.516-0.549,0.896			c0,0.34,0.117,0.6,0.352,0.778s0.571,0.268,1.011,0.268c0.404,0,0.785-0.059,1.143-0.176s0.709-0.299,1.055-0.545V207.63z"/><path class="st115" d="M50.783,209.309h0.114c0.328,0,0.574,0.081,0.738,0.241c0.164,0.162,0.246,0.403,0.246,0.726			c0,0.346-0.083,0.595-0.25,0.747s-0.45,0.229-0.848,0.229h-2.162c-0.393,0-0.675-0.076-0.848-0.229s-0.259-0.401-0.259-0.747			c0-0.322,0.083-0.563,0.25-0.726c0.167-0.16,0.417-0.241,0.751-0.241h0.105v-2.54c0-0.703-0.098-1.202-0.294-1.498			s-0.523-0.444-0.98-0.444c-0.486,0-0.883,0.178-1.191,0.532s-0.461,0.824-0.461,1.41v2.54H45.8c0.334,0,0.583,0.081,0.747,0.241			c0.164,0.162,0.246,0.403,0.246,0.726c0,0.346-0.085,0.595-0.255,0.747s-0.451,0.229-0.844,0.229h-2.18			c-0.393,0-0.674-0.076-0.844-0.229s-0.255-0.401-0.255-0.747c0-0.322,0.082-0.563,0.246-0.726c0.164-0.16,0.413-0.241,0.747-0.241			h0.105v-4.254h-0.149c-0.316,0-0.557-0.08-0.721-0.241s-0.246-0.397-0.246-0.708c0-0.346,0.085-0.595,0.255-0.747			s0.457-0.229,0.861-0.229h1.494c0.164,0,0.289,0.032,0.374,0.097s0.127,0.158,0.127,0.281v0.686			c0.27-0.422,0.614-0.739,1.033-0.954c0.419-0.213,0.904-0.32,1.455-0.32c0.938,0,1.636,0.284,2.096,0.853s0.69,1.436,0.69,2.602			V209.309z"/><path class="st115" d="M57.894,202.937c1.424,0,2.578,0.398,3.463,1.195s1.327,1.819,1.327,3.067c0,1.254-0.442,2.279-1.327,3.076			s-2.039,1.195-3.463,1.195c-1.418,0-2.569-0.398-3.454-1.195s-1.327-1.822-1.327-3.076c0-1.248,0.444-2.271,1.332-3.067			S56.481,202.937,57.894,202.937z M57.894,204.791c-0.686,0-1.25,0.224-1.692,0.673c-0.442,0.447-0.664,1.021-0.664,1.718			c0,0.703,0.221,1.285,0.664,1.745s1.006,0.689,1.692,0.689s1.251-0.229,1.696-0.689s0.668-1.042,0.668-1.745			c0-0.697-0.221-1.271-0.664-1.718C59.152,205.015,58.585,204.791,57.894,204.791z"/><path class="st115" d="M67.113,203.921c0.281-0.246,0.615-0.439,1.002-0.58s0.791-0.211,1.213-0.211			c1.219,0,2.216,0.403,2.993,1.209s1.165,1.838,1.165,3.098c0,1.148-0.396,2.108-1.187,2.879s-1.787,1.155-2.988,1.155			c-0.568,0-1.062-0.099-1.481-0.294c-0.419-0.196-0.76-0.491-1.024-0.884v0.58c0,0.117-0.045,0.21-0.136,0.276			c-0.091,0.068-0.218,0.102-0.382,0.102h-1.354c-0.398,0-0.681-0.074-0.848-0.225c-0.167-0.148-0.25-0.399-0.25-0.751			c0-0.311,0.081-0.546,0.242-0.708c0.161-0.16,0.4-0.241,0.716-0.241h0.141v-7.629h-0.141c-0.316,0-0.558-0.083-0.725-0.251			c-0.167-0.166-0.25-0.408-0.25-0.725c0-0.346,0.085-0.595,0.255-0.747s0.457-0.229,0.861-0.229h1.644			c0.188,0,0.324,0.046,0.409,0.136c0.085,0.092,0.127,0.239,0.127,0.444V203.921z M69.056,205.002c-0.574,0-1.05,0.216-1.428,0.646			c-0.378,0.432-0.567,0.978-0.567,1.64c0,0.68,0.188,1.235,0.562,1.665c0.375,0.432,0.853,0.646,1.433,0.646			s1.059-0.217,1.437-0.65s0.567-0.987,0.567-1.661c0-0.656-0.19-1.201-0.571-1.635S69.63,205.002,69.056,205.002z"/><path class="st115" d="M79.497,202.937c1.424,0,2.578,0.398,3.463,1.195s1.327,1.819,1.327,3.067c0,1.254-0.442,2.279-1.327,3.076			s-2.039,1.195-3.463,1.195c-1.418,0-2.569-0.398-3.454-1.195s-1.327-1.822-1.327-3.076c0-1.248,0.444-2.271,1.332-3.067			S78.085,202.937,79.497,202.937z M79.497,204.791c-0.686,0-1.25,0.224-1.692,0.673c-0.442,0.447-0.664,1.021-0.664,1.718			c0,0.703,0.221,1.285,0.664,1.745s1.006,0.689,1.692,0.689s1.251-0.229,1.696-0.689s0.668-1.042,0.668-1.745			c0-0.697-0.221-1.271-0.664-1.718C80.755,205.015,80.188,204.791,79.497,204.791z"/><path class="st115" d="M89.402,204.897l0.932,1.099l1.011-1.099c-0.193,0-0.334-0.068-0.422-0.206s-0.132-0.356-0.132-0.655			c0-0.293,0.075-0.517,0.224-0.673c0.149-0.154,0.368-0.232,0.655-0.232h1.872c0.393,0,0.674,0.076,0.844,0.229			s0.255,0.401,0.255,0.747c0,0.322-0.083,0.562-0.25,0.716c-0.167,0.156-0.426,0.233-0.778,0.233H93.27l-1.837,2.004l2.197,2.25			h0.202c0.34,0,0.596,0.081,0.769,0.241c0.173,0.162,0.259,0.403,0.259,0.726c0,0.346-0.089,0.595-0.268,0.747			s-0.467,0.229-0.866,0.229H91.6c-0.287,0-0.505-0.077-0.655-0.232s-0.224-0.377-0.224-0.664c0-0.305,0.045-0.525,0.136-0.664			c0.091-0.137,0.236-0.206,0.435-0.206h0.07l-1.116-1.239l-1.081,1.239H89.2c0.211,0,0.363,0.065,0.457,0.198			c0.094,0.131,0.141,0.335,0.141,0.61c0,0.328-0.072,0.57-0.215,0.726s-0.365,0.232-0.664,0.232h-1.872			c-0.398,0-0.681-0.076-0.848-0.229s-0.25-0.401-0.25-0.747c0-0.322,0.081-0.563,0.242-0.726c0.161-0.16,0.403-0.241,0.725-0.241			h0.167l2.083-2.109l-2.013-2.145H86.88c-0.346,0-0.606-0.079-0.782-0.237s-0.264-0.396-0.264-0.712			c0-0.346,0.088-0.595,0.264-0.747s0.46-0.229,0.853-0.229h2.127c0.299,0,0.52,0.079,0.664,0.237s0.215,0.398,0.215,0.721			c0,0.27-0.045,0.472-0.136,0.606S89.59,204.897,89.402,204.897z"/><path class="st115" d="M115.646,209.326h0.149c0.316,0,0.554,0.081,0.712,0.241c0.158,0.162,0.237,0.397,0.237,0.708			c0,0.346-0.083,0.595-0.251,0.747c-0.166,0.152-0.449,0.229-0.848,0.229h-1.345c-0.17,0-0.301-0.033-0.392-0.102			c-0.091-0.066-0.136-0.159-0.136-0.276v-0.615c-0.287,0.393-0.656,0.693-1.107,0.901c-0.451,0.207-0.958,0.312-1.521,0.312			c-1.148,0-2.109-0.392-2.883-1.173c-0.773-0.783-1.16-1.76-1.16-2.932c0-1.219,0.391-2.229,1.174-3.032			c0.781-0.803,1.776-1.204,2.983-1.204c0.416,0,0.821,0.069,1.218,0.207c0.395,0.138,0.757,0.332,1.085,0.584v-2.224h-1.169			c-0.404,0-0.691-0.077-0.861-0.233c-0.17-0.154-0.255-0.402-0.255-0.742c0-0.346,0.085-0.595,0.255-0.747s0.457-0.229,0.861-0.229			h2.733c0.199,0,0.335,0.041,0.409,0.123c0.072,0.082,0.109,0.234,0.109,0.457V209.326z M111.524,205.002			c-0.574,0-1.05,0.216-1.429,0.646c-0.377,0.432-0.566,0.978-0.566,1.64c0,0.68,0.188,1.235,0.562,1.665			c0.375,0.432,0.853,0.646,1.433,0.646s1.06-0.217,1.437-0.65c0.379-0.434,0.567-0.987,0.567-1.661c0-0.656-0.19-1.201-0.571-1.635			S112.099,205.002,111.524,205.002z"/><path class="st115" d="M120.313,207.709c0.152,0.65,0.446,1.137,0.883,1.459s1.019,0.483,1.745,0.483s1.444-0.177,2.153-0.531			s1.137-0.532,1.283-0.532c0.217,0,0.394,0.081,0.531,0.241c0.138,0.162,0.207,0.368,0.207,0.62c0,0.551-0.407,1.025-1.222,1.424			s-1.822,0.598-3.023,0.598c-1.418,0-2.571-0.398-3.458-1.195c-0.889-0.797-1.332-1.822-1.332-3.076			c0-1.248,0.443-2.271,1.332-3.067c0.887-0.797,2.04-1.195,3.458-1.195c1.266,0,2.314,0.373,3.146,1.121			c0.832,0.746,1.248,1.662,1.248,2.746c0,0.346-0.083,0.583-0.251,0.712c-0.166,0.129-0.511,0.193-1.032,0.193H120.313z			 M125.051,206.338c-0.1-0.545-0.356-0.967-0.769-1.266c-0.414-0.299-0.951-0.448-1.613-0.448c-0.639,0-1.153,0.143-1.543,0.426			c-0.39,0.285-0.66,0.714-0.812,1.288H125.051z"/><path class="st115" d="M131.836,210.425v2.391h1.116c0.398,0,0.684,0.076,0.856,0.229s0.26,0.401,0.26,0.747			c0,0.34-0.085,0.583-0.255,0.729s-0.457,0.22-0.861,0.22h-3.727c-0.404,0-0.688-0.072-0.853-0.216s-0.246-0.388-0.246-0.733			s0.084-0.595,0.25-0.747c0.168-0.152,0.45-0.229,0.849-0.229h0.519v-7.761h-0.141c-0.311,0-0.548-0.082-0.712-0.246			s-0.246-0.404-0.246-0.721c0-0.346,0.082-0.592,0.246-0.738s0.448-0.22,0.853-0.22h1.354c0.17,0,0.296,0.031,0.378,0.092			c0.082,0.062,0.123,0.151,0.123,0.269v0.633c0.299-0.398,0.66-0.698,1.085-0.901c0.425-0.201,0.904-0.303,1.438-0.303			c1.201,0,2.197,0.384,2.988,1.151s1.187,1.734,1.187,2.9c0,1.219-0.384,2.228-1.151,3.028c-0.768,0.799-1.734,1.199-2.9,1.199			c-0.475,0-0.918-0.066-1.332-0.197C132.5,210.868,132.141,210.677,131.836,210.425z M133.866,204.791			c-0.58,0-1.058,0.214-1.433,0.642s-0.562,0.976-0.562,1.644s0.188,1.216,0.562,1.644s0.853,0.642,1.433,0.642			s1.06-0.216,1.437-0.646c0.379-0.432,0.567-0.978,0.567-1.64c0-0.668-0.188-1.216-0.562-1.644S134.452,204.791,133.866,204.791z"			/><path class="st115" d="M145.389,209.326h1.89c0.404,0,0.688,0.073,0.853,0.22s0.246,0.39,0.246,0.729			c0,0.346-0.083,0.595-0.251,0.747c-0.166,0.152-0.449,0.229-0.848,0.229h-5.959c-0.393,0-0.672-0.076-0.84-0.229			c-0.166-0.152-0.25-0.401-0.25-0.747s0.08-0.59,0.242-0.733c0.16-0.144,0.443-0.216,0.848-0.216h1.89v-7.629h-0.967			c-0.398,0-0.685-0.077-0.856-0.233c-0.174-0.154-0.26-0.402-0.26-0.742c0-0.346,0.085-0.595,0.255-0.747s0.457-0.229,0.861-0.229			h2.628c0.164,0,0.291,0.034,0.383,0.101c0.09,0.068,0.136,0.16,0.136,0.277V209.326z"/><path class="st115" d="M155.109,202.937c1.424,0,2.578,0.398,3.463,1.195s1.327,1.819,1.327,3.067			c0,1.254-0.442,2.279-1.327,3.076s-2.039,1.195-3.463,1.195c-1.418,0-2.569-0.398-3.454-1.195s-1.327-1.822-1.327-3.076			c0-1.248,0.443-2.271,1.332-3.067C152.547,203.335,153.697,202.937,155.109,202.937z M155.109,204.791			c-0.686,0-1.25,0.224-1.691,0.673c-0.443,0.447-0.664,1.021-0.664,1.718c0,0.703,0.221,1.285,0.664,1.745			c0.441,0.46,1.006,0.689,1.691,0.689s1.251-0.229,1.696-0.689s0.668-1.042,0.668-1.745c0-0.697-0.222-1.271-0.663-1.718			C156.367,205.015,155.801,204.791,155.109,204.791z"/><path class="st115" d="M164.364,205.055l1.582,3.744l1.661-3.744h-0.141c-0.316,0-0.558-0.082-0.726-0.246			c-0.166-0.164-0.25-0.404-0.25-0.721c0-0.346,0.084-0.592,0.25-0.738c0.168-0.146,0.456-0.22,0.866-0.22h2.065			c0.41,0,0.699,0.074,0.865,0.225c0.168,0.148,0.251,0.394,0.251,0.733c0,0.316-0.082,0.557-0.246,0.721s-0.404,0.246-0.721,0.246			h-0.149l-3.612,7.761h0.396c0.398,0,0.684,0.076,0.857,0.229c0.172,0.152,0.259,0.401,0.259,0.747c0,0.34-0.087,0.586-0.259,0.738			c-0.174,0.152-0.459,0.229-0.857,0.229h-3.85c-0.404,0-0.691-0.075-0.861-0.224c-0.17-0.15-0.255-0.397-0.255-0.743			s0.085-0.595,0.255-0.747s0.457-0.229,0.861-0.229h1.362l0.826-1.767l-2.663-5.994h-0.141c-0.316,0-0.559-0.082-0.725-0.246			c-0.168-0.164-0.251-0.404-0.251-0.721c0-0.346,0.085-0.592,0.255-0.738s0.457-0.22,0.861-0.22h2.232			c0.404,0,0.691,0.074,0.861,0.225c0.17,0.148,0.255,0.394,0.255,0.733c0,0.316-0.083,0.557-0.251,0.721			c-0.166,0.164-0.405,0.246-0.716,0.246H164.364z"/><path class="st115" d="M183.85,206.198h7.286c0.141,0,0.247,0.035,0.32,0.105s0.11,0.173,0.11,0.308v1.099			c0,0.123-0.046,0.234-0.136,0.334c-0.092,0.1-0.189,0.149-0.295,0.149h-7.286c-0.117,0-0.21-0.044-0.276-0.132			c-0.068-0.088-0.102-0.205-0.102-0.352v-1.099c0-0.123,0.035-0.223,0.105-0.299S183.738,206.198,183.85,206.198z"/><path class="st115" d="M194.651,206.198h7.286c0.141,0,0.247,0.035,0.32,0.105s0.11,0.173,0.11,0.308v1.099			c0,0.123-0.046,0.234-0.136,0.334c-0.092,0.1-0.189,0.149-0.295,0.149h-7.286c-0.117,0-0.21-0.044-0.276-0.132			c-0.068-0.088-0.102-0.205-0.102-0.352v-1.099c0-0.123,0.035-0.223,0.105-0.299S194.54,206.198,194.651,206.198z"/><path class="st115" d="M207.448,210.425v2.391h1.116c0.398,0,0.684,0.076,0.856,0.229s0.26,0.401,0.26,0.747			c0,0.34-0.085,0.583-0.255,0.729s-0.457,0.22-0.861,0.22h-3.727c-0.404,0-0.688-0.072-0.853-0.216s-0.246-0.388-0.246-0.733			s0.084-0.595,0.25-0.747c0.168-0.152,0.45-0.229,0.849-0.229h0.519v-7.761h-0.141c-0.311,0-0.548-0.082-0.712-0.246			s-0.246-0.404-0.246-0.721c0-0.346,0.082-0.592,0.246-0.738s0.448-0.22,0.853-0.22h1.354c0.17,0,0.296,0.031,0.378,0.092			c0.082,0.062,0.123,0.151,0.123,0.269v0.633c0.299-0.398,0.66-0.698,1.085-0.901c0.425-0.201,0.904-0.303,1.438-0.303			c1.201,0,2.197,0.384,2.988,1.151s1.187,1.734,1.187,2.9c0,1.219-0.384,2.228-1.151,3.028c-0.768,0.799-1.734,1.199-2.9,1.199			c-0.475,0-0.918-0.066-1.332-0.197C208.112,210.868,207.753,210.677,207.448,210.425z M209.479,204.791			c-0.58,0-1.058,0.214-1.433,0.642s-0.562,0.976-0.562,1.644s0.188,1.216,0.562,1.644s0.853,0.642,1.433,0.642			s1.06-0.216,1.437-0.646c0.379-0.432,0.567-0.978,0.567-1.64c0-0.668-0.188-1.216-0.562-1.644S210.064,204.791,209.479,204.791z"			/><path class="st115" d="M219.524,206.479v2.848h2.074c0.398,0,0.681,0.073,0.849,0.22c0.166,0.146,0.25,0.39,0.25,0.729			c0,0.346-0.084,0.595-0.25,0.747c-0.168,0.152-0.45,0.229-0.849,0.229h-4.913c-0.404,0-0.691-0.076-0.861-0.229			s-0.255-0.401-0.255-0.747c0-0.34,0.084-0.583,0.252-0.729s0.457-0.22,0.87-0.22h0.671v-4.271h-0.38			c-0.401,0-0.686-0.075-0.854-0.224c-0.168-0.15-0.252-0.397-0.252-0.743s0.08-0.592,0.242-0.738c0.16-0.146,0.446-0.22,0.856-0.22			h1.872c0.158,0,0.281,0.034,0.369,0.102s0.132,0.159,0.132,0.276v1.301c0.639-0.686,1.235-1.175,1.788-1.468			c0.555-0.293,1.15-0.439,1.789-0.439c0.58,0,1.04,0.131,1.38,0.391c0.34,0.262,0.51,0.611,0.51,1.051			c0,0.34-0.117,0.619-0.352,0.84c-0.234,0.219-0.536,0.329-0.905,0.329c-0.264,0-0.576-0.097-0.936-0.29			c-0.361-0.193-0.611-0.29-0.752-0.29c-0.281,0-0.612,0.126-0.993,0.378S220.046,205.951,219.524,206.479z"/><path class="st115" d="M230.722,202.937c1.424,0,2.578,0.398,3.463,1.195s1.327,1.819,1.327,3.067			c0,1.254-0.442,2.279-1.327,3.076s-2.039,1.195-3.463,1.195c-1.418,0-2.569-0.398-3.454-1.195s-1.327-1.822-1.327-3.076			c0-1.248,0.443-2.271,1.332-3.067C228.159,203.335,229.31,202.937,230.722,202.937z M230.722,204.791			c-0.686,0-1.25,0.224-1.691,0.673c-0.443,0.447-0.664,1.021-0.664,1.718c0,0.703,0.221,1.285,0.664,1.745			c0.441,0.46,1.006,0.689,1.691,0.689s1.251-0.229,1.696-0.689s0.668-1.042,0.668-1.745c0-0.697-0.222-1.271-0.663-1.718			C231.979,205.015,231.413,204.791,230.722,204.791z"/><path class="st115" d="M245.268,209.326h0.149c0.316,0,0.554,0.081,0.712,0.241c0.158,0.162,0.237,0.397,0.237,0.708			c0,0.346-0.083,0.595-0.251,0.747c-0.166,0.152-0.449,0.229-0.848,0.229h-1.345c-0.17,0-0.301-0.033-0.392-0.102			c-0.091-0.066-0.136-0.159-0.136-0.276v-0.615c-0.287,0.393-0.656,0.693-1.107,0.901c-0.451,0.207-0.958,0.312-1.521,0.312			c-1.148,0-2.109-0.392-2.883-1.173c-0.773-0.783-1.16-1.76-1.16-2.932c0-1.219,0.391-2.229,1.174-3.032			c0.781-0.803,1.776-1.204,2.983-1.204c0.416,0,0.821,0.069,1.218,0.207c0.395,0.138,0.757,0.332,1.085,0.584v-2.224h-1.169			c-0.404,0-0.691-0.077-0.861-0.233c-0.17-0.154-0.255-0.402-0.255-0.742c0-0.346,0.085-0.595,0.255-0.747s0.457-0.229,0.861-0.229			h2.733c0.199,0,0.335,0.041,0.409,0.123c0.072,0.082,0.109,0.234,0.109,0.457V209.326z M241.146,205.002			c-0.574,0-1.05,0.216-1.429,0.646c-0.377,0.432-0.566,0.978-0.566,1.64c0,0.68,0.188,1.235,0.562,1.665			c0.375,0.432,0.853,0.646,1.433,0.646s1.06-0.217,1.437-0.65c0.379-0.434,0.567-0.987,0.567-1.661c0-0.656-0.19-1.201-0.571-1.635			S241.72,205.002,241.146,205.002z"/><path class="st115" d="M253.714,205.055h-0.141c-0.316,0-0.556-0.082-0.717-0.246s-0.241-0.404-0.241-0.721			c0-0.346,0.082-0.592,0.246-0.738s0.448-0.22,0.853-0.22h1.661c0.158,0,0.281,0.034,0.369,0.102s0.132,0.159,0.132,0.276v5.818			h0.141c0.316,0,0.559,0.082,0.725,0.246c0.168,0.164,0.251,0.398,0.251,0.703c0,0.352-0.085,0.603-0.255,0.751			c-0.17,0.15-0.457,0.225-0.861,0.225h-1.477c-0.164,0-0.292-0.035-0.383-0.105s-0.136-0.167-0.136-0.29v-0.668			c-0.281,0.422-0.626,0.738-1.032,0.949c-0.408,0.211-0.887,0.316-1.438,0.316c-0.943,0-1.644-0.284-2.101-0.853			s-0.686-1.438-0.686-2.61v-2.936h-0.149c-0.316,0-0.557-0.082-0.721-0.246s-0.246-0.404-0.246-0.721			c0-0.346,0.084-0.592,0.25-0.738c0.168-0.146,0.456-0.22,0.866-0.22h1.652c0.158,0,0.278,0.034,0.36,0.102			s0.123,0.159,0.123,0.276v4.087c0,0.721,0.1,1.228,0.299,1.521s0.527,0.439,0.984,0.439c0.486,0,0.886-0.181,1.199-0.54			c0.313-0.361,0.471-0.834,0.471-1.42V205.055z"/><path class="st115" d="M265.737,203.605c0.07-0.229,0.181-0.4,0.329-0.514c0.15-0.115,0.342-0.172,0.576-0.172			c0.316,0,0.542,0.096,0.677,0.285c0.135,0.191,0.202,0.521,0.202,0.989v1.441c0,0.357-0.073,0.621-0.22,0.791			s-0.372,0.255-0.677,0.255c-0.217,0-0.398-0.05-0.545-0.149s-0.302-0.29-0.466-0.571c-0.234-0.398-0.542-0.692-0.923-0.883			s-0.847-0.286-1.397-0.286c-0.686,0-1.247,0.224-1.683,0.673c-0.438,0.447-0.655,1.021-0.655,1.718			c0,0.732,0.226,1.321,0.677,1.767s1.058,0.668,1.819,0.668c0.691,0,1.378-0.191,2.062-0.576c0.682-0.383,1.1-0.575,1.252-0.575			c0.217,0,0.396,0.083,0.541,0.251c0.143,0.166,0.215,0.376,0.215,0.628c0,0.551-0.418,1.043-1.252,1.477			c-0.836,0.434-1.827,0.65-2.976,0.65c-1.418,0-2.571-0.398-3.458-1.195c-0.889-0.797-1.332-1.822-1.332-3.076			c0-1.225,0.439-2.244,1.318-3.059s1.986-1.222,3.322-1.222c0.451,0,0.891,0.056,1.318,0.167S265.315,203.37,265.737,203.605z"/><path class="st115" d="M273.322,203.622h2.681c0.404,0,0.691,0.073,0.861,0.22s0.255,0.39,0.255,0.729			c0,0.346-0.087,0.595-0.259,0.747c-0.174,0.152-0.459,0.229-0.857,0.229h-2.681v2.25c0,0.633,0.097,1.066,0.29,1.301			s0.533,0.352,1.02,0.352c0.457,0,0.996-0.132,1.617-0.396s1.037-0.396,1.248-0.396c0.24,0,0.446,0.096,0.619,0.286			s0.26,0.42,0.26,0.689c0,0.451-0.408,0.863-1.227,1.234c-0.816,0.373-1.744,0.559-2.781,0.559c-0.604,0-1.134-0.082-1.591-0.246			s-0.817-0.398-1.081-0.703c-0.193-0.234-0.331-0.516-0.413-0.844s-0.123-0.876-0.123-1.644v-0.193v-2.25h-0.826			c-0.398,0-0.681-0.076-0.849-0.229c-0.166-0.152-0.25-0.401-0.25-0.747s0.082-0.59,0.246-0.734			c0.164-0.143,0.448-0.215,0.853-0.215h0.826v-2.057c0-0.404,0.083-0.688,0.251-0.853c0.166-0.164,0.443-0.246,0.83-0.246			s0.664,0.082,0.83,0.246c0.168,0.164,0.251,0.448,0.251,0.853V203.622z"/><path class="st115" d="M285.961,209.326h1.89c0.404,0,0.691,0.073,0.861,0.22s0.255,0.39,0.255,0.729			c0,0.346-0.087,0.595-0.26,0.747s-0.458,0.229-0.856,0.229h-5.941c-0.398,0-0.685-0.076-0.856-0.229			c-0.174-0.152-0.26-0.401-0.26-0.747c0-0.34,0.084-0.583,0.25-0.729c0.168-0.146,0.456-0.22,0.866-0.22h1.89v-4.271h-0.993			c-0.393,0-0.674-0.075-0.844-0.224c-0.17-0.15-0.255-0.397-0.255-0.743s0.082-0.592,0.246-0.738s0.448-0.22,0.853-0.22h2.646			c0.164,0,0.29,0.034,0.378,0.102s0.132,0.159,0.132,0.276V209.326z M284.695,199.158c0.428,0,0.712,0.082,0.853,0.246			s0.211,0.557,0.211,1.178c0,0.598-0.063,0.969-0.188,1.111c-0.127,0.145-0.424,0.216-0.893,0.216			c-0.457,0-0.752-0.067-0.883-0.202c-0.133-0.135-0.198-0.404-0.198-0.809c0-0.75,0.067-1.228,0.202-1.433			S284.232,199.158,284.695,199.158z"/><path class="st115" d="M295.532,202.937c1.424,0,2.578,0.398,3.463,1.195s1.327,1.819,1.327,3.067			c0,1.254-0.442,2.279-1.327,3.076s-2.039,1.195-3.463,1.195c-1.418,0-2.569-0.398-3.454-1.195s-1.327-1.822-1.327-3.076			c0-1.248,0.443-2.271,1.332-3.067C292.97,203.335,294.12,202.937,295.532,202.937z M295.532,204.791			c-0.686,0-1.25,0.224-1.691,0.673c-0.443,0.447-0.664,1.021-0.664,1.718c0,0.703,0.221,1.285,0.664,1.745			c0.441,0.46,1.006,0.689,1.691,0.689s1.251-0.229,1.696-0.689s0.668-1.042,0.668-1.745c0-0.697-0.222-1.271-0.663-1.718			C296.79,205.015,296.224,204.791,295.532,204.791z"/><path class="st115" d="M310.025,209.309h0.114c0.328,0,0.574,0.081,0.738,0.241c0.164,0.162,0.246,0.403,0.246,0.726			c0,0.346-0.083,0.595-0.251,0.747c-0.166,0.152-0.449,0.229-0.848,0.229h-2.162c-0.393,0-0.676-0.076-0.848-0.229			c-0.174-0.152-0.26-0.401-0.26-0.747c0-0.322,0.084-0.563,0.25-0.726c0.168-0.16,0.418-0.241,0.752-0.241h0.105v-2.54			c0-0.703-0.099-1.202-0.295-1.498s-0.522-0.444-0.979-0.444c-0.486,0-0.884,0.178-1.19,0.532c-0.309,0.354-0.462,0.824-0.462,1.41			v2.54h0.105c0.334,0,0.583,0.081,0.747,0.241c0.164,0.162,0.246,0.403,0.246,0.726c0,0.346-0.085,0.595-0.255,0.747			s-0.451,0.229-0.844,0.229h-2.18c-0.393,0-0.674-0.076-0.844-0.229s-0.255-0.401-0.255-0.747c0-0.322,0.082-0.563,0.246-0.726			c0.164-0.16,0.413-0.241,0.747-0.241h0.105v-4.254h-0.149c-0.316,0-0.557-0.08-0.721-0.241s-0.246-0.397-0.246-0.708			c0-0.346,0.085-0.595,0.255-0.747s0.457-0.229,0.861-0.229h1.494c0.164,0,0.288,0.032,0.374,0.097			c0.084,0.064,0.127,0.158,0.127,0.281v0.686c0.27-0.422,0.613-0.739,1.033-0.954c0.418-0.213,0.903-0.32,1.454-0.32			c0.938,0,1.636,0.284,2.097,0.853c0.459,0.568,0.689,1.436,0.689,2.602V209.309z"/></g>	<g>		<g>			<line class="st194" x1="64.771" y1="89.609" x2="152.291" y2="89.609"/><g>				<path class="st30" d="M156.517,89.609c-1.984,0.738-4.453,1.996-5.979,3.329l1.205-3.329l-1.205-3.329					C152.063,87.613,154.528,88.872,156.517,89.609z"/></g>		</g>	</g>	<g>		<g>			<line class="st194" x1="87.923" y1="73.55" x2="152.291" y2="73.55"/><g>				<path class="st30" d="M156.517,73.55c-1.984,0.738-4.453,1.996-5.979,3.329l1.205-3.329l-1.205-3.329					C152.063,71.554,154.528,72.813,156.517,73.55z"/></g>		</g>	</g>	<g>		<g>			<line class="st194" x1="80.662" y1="81.58" x2="152.291" y2="81.58"/><g>				<path class="st30" d="M156.517,81.58c-1.984,0.729-4.453,1.995-5.979,3.327l1.205-3.327l-1.205-3.329					C152.063,79.585,154.528,80.844,156.517,81.58z"/></g>		</g>	</g></g><g id="framework-sniff" data-size="383x162" class="nanobox-svg ">	<g>		<g class="st50">			<path class="st51" d="M4.98,19.734c-0.06,0.109-0.152,0.165-0.277,0.165c-0.075,0-0.16-0.027-0.255-0.083				c-0.095-0.055-0.211-0.116-0.349-0.184c-0.138-0.067-0.301-0.13-0.492-0.188c-0.19-0.058-0.415-0.086-0.675-0.086				c-0.225,0-0.427,0.028-0.607,0.086s-0.334,0.137-0.461,0.236s-0.225,0.216-0.292,0.349S1.47,20.307,1.47,20.462				c0,0.194,0.056,0.357,0.168,0.487c0.113,0.13,0.261,0.242,0.446,0.337c0.185,0.096,0.395,0.18,0.63,0.252				c0.235,0.072,0.476,0.149,0.724,0.232c0.248,0.082,0.489,0.174,0.724,0.273c0.235,0.101,0.445,0.226,0.63,0.375				c0.185,0.15,0.334,0.334,0.446,0.552c0.113,0.217,0.169,0.479,0.169,0.783c0,0.351-0.062,0.674-0.188,0.972				c-0.125,0.297-0.31,0.555-0.555,0.772s-0.545,0.389-0.9,0.514S3,26.199,2.535,26.199c-0.53,0-1.01-0.086-1.44-0.259				C0.665,25.768,0.3,25.547,0,25.276l0.315-0.51c0.04-0.064,0.087-0.115,0.143-0.15c0.055-0.034,0.127-0.052,0.218-0.052				c0.09,0,0.185,0.035,0.285,0.104c0.1,0.07,0.222,0.147,0.364,0.232c0.143,0.085,0.315,0.163,0.518,0.232				c0.203,0.07,0.457,0.105,0.761,0.105c0.26,0,0.488-0.034,0.683-0.102s0.357-0.158,0.487-0.273				c0.13-0.115,0.227-0.248,0.289-0.397c0.062-0.15,0.094-0.311,0.094-0.48c0-0.21-0.056-0.384-0.169-0.521				c-0.112-0.138-0.261-0.256-0.446-0.353c-0.185-0.098-0.396-0.183-0.634-0.256c-0.237-0.072-0.48-0.148-0.728-0.229				c-0.247-0.08-0.49-0.171-0.728-0.273c-0.237-0.103-0.449-0.231-0.633-0.387c-0.185-0.154-0.334-0.346-0.446-0.573				c-0.113-0.228-0.169-0.504-0.169-0.829c0-0.29,0.06-0.568,0.18-0.836c0.12-0.268,0.295-0.503,0.525-0.705				s0.512-0.364,0.848-0.483c0.334-0.12,0.717-0.181,1.147-0.181c0.5,0,0.949,0.079,1.346,0.236s0.741,0.374,1.031,0.649				L4.98,19.734z"/><path class="st51" d="M8.925,16.097c0,0.13-0.026,0.251-0.079,0.363c-0.053,0.113-0.123,0.213-0.21,0.301				c-0.087,0.087-0.189,0.156-0.304,0.206c-0.115,0.05-0.238,0.075-0.368,0.075s-0.251-0.025-0.364-0.075				c-0.112-0.05-0.212-0.119-0.3-0.206c-0.087-0.088-0.156-0.188-0.207-0.301c-0.05-0.112-0.075-0.233-0.075-0.363				s0.025-0.254,0.075-0.371c0.05-0.117,0.119-0.22,0.207-0.308s0.188-0.156,0.3-0.206c0.113-0.05,0.234-0.075,0.364-0.075				s0.252,0.025,0.368,0.075c0.115,0.05,0.216,0.118,0.304,0.206s0.157,0.19,0.21,0.308C8.898,15.843,8.925,15.967,8.925,16.097z				 M8.625,18.481v7.598H7.29v-7.598H8.625z"/><path class="st51" d="M10.98,26.079v-7.598h0.795c0.19,0,0.31,0.093,0.36,0.277l0.105,0.825c0.33-0.365,0.699-0.66,1.106-0.885				c0.407-0.226,0.878-0.338,1.414-0.338c0.415,0,0.781,0.069,1.099,0.206c0.317,0.138,0.583,0.333,0.795,0.586				c0.213,0.252,0.374,0.556,0.484,0.911c0.11,0.354,0.165,0.747,0.165,1.177v4.838h-1.335v-4.838c0-0.574-0.131-1.021-0.394-1.338				c-0.263-0.318-0.664-0.477-1.204-0.477c-0.395,0-0.764,0.095-1.106,0.285c-0.343,0.189-0.659,0.447-0.949,0.772v5.595H10.98z"/><path class="st51" d="M24.9,26.079h-0.592c-0.13,0-0.235-0.02-0.315-0.06s-0.133-0.125-0.158-0.256l-0.15-0.704				c-0.2,0.18-0.395,0.341-0.585,0.483s-0.39,0.263-0.6,0.36c-0.21,0.097-0.434,0.171-0.671,0.221				c-0.237,0.05-0.501,0.075-0.791,0.075c-0.295,0-0.571-0.042-0.829-0.124c-0.258-0.083-0.481-0.207-0.671-0.373				c-0.19-0.165-0.341-0.375-0.454-0.628c-0.113-0.254-0.169-0.554-0.169-0.899c0-0.301,0.083-0.591,0.248-0.869				s0.431-0.525,0.799-0.741c0.367-0.216,0.849-0.393,1.444-0.531c0.595-0.138,1.322-0.207,2.182-0.207V21.23				c0-0.594-0.126-1.043-0.378-1.348c-0.252-0.304-0.626-0.456-1.122-0.456c-0.325,0-0.599,0.041-0.821,0.124				c-0.222,0.082-0.415,0.175-0.577,0.277c-0.163,0.103-0.303,0.194-0.42,0.277c-0.118,0.082-0.234,0.124-0.349,0.124				c-0.09,0-0.168-0.024-0.236-0.071c-0.068-0.048-0.122-0.106-0.162-0.177l-0.24-0.428c0.42-0.404,0.873-0.707,1.357-0.907				s1.022-0.3,1.612-0.3c0.425,0,0.803,0.07,1.133,0.21s0.607,0.335,0.833,0.585c0.225,0.25,0.395,0.553,0.51,0.907				c0.115,0.355,0.172,0.745,0.172,1.17V26.079z M21.435,25.262c0.235,0,0.45-0.023,0.645-0.071s0.379-0.115,0.551-0.202				c0.172-0.088,0.337-0.194,0.495-0.319c0.157-0.125,0.311-0.268,0.461-0.428v-1.567c-0.615,0-1.137,0.039-1.567,0.117				s-0.78,0.18-1.05,0.306s-0.466,0.274-0.589,0.445s-0.184,0.361-0.184,0.573c0,0.201,0.032,0.374,0.097,0.521				c0.065,0.146,0.153,0.265,0.263,0.358c0.11,0.093,0.24,0.161,0.39,0.203C21.098,25.24,21.26,25.262,21.435,25.262z"/><path class="st51" d="M29.227,26.199c-0.6,0-1.061-0.168-1.384-0.503c-0.322-0.335-0.484-0.817-0.484-1.447v-4.65h-0.915				c-0.08,0-0.148-0.023-0.203-0.07c-0.055-0.048-0.083-0.122-0.083-0.222v-0.532l1.245-0.158l0.307-2.347				c0.01-0.075,0.042-0.137,0.098-0.185c0.055-0.047,0.125-0.071,0.21-0.071h0.675v2.618h2.175v0.967h-2.175v4.561				c0,0.32,0.077,0.558,0.232,0.713c0.155,0.154,0.355,0.232,0.6,0.232c0.14,0,0.261-0.02,0.364-0.057s0.191-0.079,0.267-0.124				c0.075-0.045,0.139-0.086,0.191-0.123c0.053-0.038,0.099-0.057,0.139-0.057c0.07,0,0.132,0.043,0.188,0.128l0.39,0.637				c-0.23,0.216-0.507,0.384-0.833,0.507C29.907,26.138,29.572,26.199,29.227,26.199z"/><path class="st51" d="M32.52,26.079v-7.598h0.765c0.145,0,0.245,0.027,0.3,0.083c0.055,0.055,0.092,0.149,0.112,0.284l0.09,1.186				c0.26-0.53,0.582-0.943,0.964-1.241c0.383-0.298,0.831-0.446,1.346-0.446c0.21,0,0.4,0.023,0.57,0.071				c0.17,0.048,0.327,0.113,0.472,0.198l-0.172,0.998c-0.035,0.125-0.112,0.188-0.232,0.188c-0.07,0-0.178-0.023-0.323-0.071				s-0.347-0.071-0.607-0.071c-0.465,0-0.854,0.135-1.166,0.405c-0.312,0.27-0.574,0.662-0.784,1.177v4.838H32.52z"/><path class="st51" d="M43.859,26.079h-0.592c-0.13,0-0.235-0.02-0.315-0.06s-0.133-0.125-0.158-0.256l-0.15-0.704				c-0.2,0.18-0.395,0.341-0.585,0.483s-0.39,0.263-0.6,0.36c-0.21,0.097-0.434,0.171-0.671,0.221				c-0.237,0.05-0.501,0.075-0.791,0.075c-0.295,0-0.571-0.042-0.829-0.124c-0.258-0.083-0.481-0.207-0.671-0.373				c-0.19-0.165-0.341-0.375-0.454-0.628c-0.113-0.254-0.169-0.554-0.169-0.899c0-0.301,0.083-0.591,0.248-0.869				s0.431-0.525,0.799-0.741c0.367-0.216,0.849-0.393,1.444-0.531c0.595-0.138,1.322-0.207,2.182-0.207V21.23				c0-0.594-0.126-1.043-0.378-1.348c-0.252-0.304-0.626-0.456-1.122-0.456c-0.325,0-0.599,0.041-0.821,0.124				c-0.222,0.082-0.415,0.175-0.577,0.277c-0.163,0.103-0.303,0.194-0.42,0.277c-0.118,0.082-0.234,0.124-0.349,0.124				c-0.09,0-0.168-0.024-0.236-0.071c-0.068-0.048-0.122-0.106-0.162-0.177l-0.24-0.428c0.42-0.404,0.873-0.707,1.357-0.907				s1.022-0.3,1.612-0.3c0.425,0,0.803,0.07,1.133,0.21s0.607,0.335,0.833,0.585c0.225,0.25,0.395,0.553,0.51,0.907				c0.115,0.355,0.172,0.745,0.172,1.17V26.079z M40.395,25.262c0.235,0,0.45-0.023,0.645-0.071s0.379-0.115,0.551-0.202				c0.172-0.088,0.337-0.194,0.495-0.319c0.157-0.125,0.311-0.268,0.461-0.428v-1.567c-0.615,0-1.137,0.039-1.567,0.117				s-0.78,0.18-1.05,0.306s-0.466,0.274-0.589,0.445s-0.184,0.361-0.184,0.573c0,0.201,0.032,0.374,0.097,0.521				c0.065,0.146,0.153,0.265,0.263,0.358c0.11,0.093,0.24,0.161,0.39,0.203C40.057,25.24,40.22,25.262,40.395,25.262z"/></g>		<g class="st50">			<path class="st51" d="M2.115,54.023v11.048H0.78V54.023H2.115z"/><path class="st51" d="M7.545,57.354c0.555,0,1.056,0.093,1.504,0.277c0.447,0.186,0.827,0.448,1.14,0.788				c0.312,0.34,0.552,0.751,0.72,1.233s0.251,1.021,0.251,1.616c0,0.601-0.084,1.141-0.251,1.62c-0.167,0.48-0.408,0.891-0.72,1.23				c-0.313,0.34-0.693,0.601-1.14,0.783c-0.448,0.183-0.949,0.274-1.504,0.274c-0.555,0-1.056-0.092-1.504-0.274				c-0.447-0.183-0.829-0.443-1.144-0.783s-0.558-0.75-0.728-1.23c-0.17-0.479-0.255-1.02-0.255-1.62				c0-0.595,0.085-1.134,0.255-1.616s0.413-0.894,0.728-1.233s0.696-0.603,1.144-0.788C6.489,57.446,6.99,57.354,7.545,57.354z				 M7.545,64.134c0.75,0,1.31-0.251,1.68-0.754c0.37-0.502,0.555-1.203,0.555-2.104c0-0.905-0.185-1.61-0.555-2.115				c-0.37-0.505-0.93-0.758-1.68-0.758c-0.38,0-0.71,0.065-0.99,0.195c-0.28,0.13-0.514,0.317-0.702,0.562s-0.327,0.547-0.42,0.904				c-0.092,0.357-0.139,0.761-0.139,1.211s0.046,0.853,0.139,1.207c0.093,0.355,0.232,0.654,0.42,0.896				c0.188,0.243,0.421,0.429,0.702,0.559C6.835,64.069,7.165,64.134,7.545,64.134z"/><path class="st51" d="M15.113,65.191c-0.6,0-1.061-0.168-1.384-0.503c-0.322-0.335-0.484-0.817-0.484-1.447v-4.65h-0.915				c-0.08,0-0.148-0.023-0.203-0.07c-0.055-0.048-0.083-0.122-0.083-0.222v-0.532l1.245-0.158l0.307-2.347				c0.01-0.075,0.042-0.137,0.098-0.185c0.055-0.047,0.125-0.071,0.21-0.071h0.675v2.618h2.175v0.967h-2.175v4.561				c0,0.32,0.077,0.558,0.232,0.713c0.155,0.154,0.355,0.232,0.6,0.232c0.14,0,0.261-0.02,0.364-0.057s0.191-0.079,0.267-0.124				c0.075-0.045,0.139-0.086,0.191-0.123c0.053-0.038,0.099-0.057,0.139-0.057c0.07,0,0.132,0.043,0.188,0.128l0.39,0.637				c-0.23,0.216-0.507,0.384-0.833,0.507C15.793,65.13,15.458,65.191,15.113,65.191z"/><path class="st51" d="M19.56,57.474v4.845c0,0.575,0.132,1.021,0.397,1.335c0.265,0.315,0.665,0.473,1.2,0.473				c0.39,0,0.757-0.092,1.103-0.277c0.345-0.185,0.662-0.442,0.952-0.772v-5.603h1.335v7.598h-0.795c-0.19,0-0.31-0.093-0.36-0.277				l-0.105-0.817c-0.33,0.365-0.7,0.658-1.11,0.881c-0.41,0.223-0.88,0.334-1.41,0.334c-0.415,0-0.781-0.069-1.099-0.206				c-0.318-0.138-0.584-0.331-0.799-0.582c-0.215-0.249-0.376-0.552-0.484-0.907c-0.107-0.354-0.161-0.747-0.161-1.178v-4.845H19.56				z"/><path class="st51" d="M31.095,58.727c-0.06,0.109-0.152,0.165-0.277,0.165c-0.075,0-0.16-0.027-0.255-0.083				c-0.095-0.055-0.211-0.116-0.349-0.184c-0.138-0.067-0.301-0.13-0.492-0.188c-0.19-0.058-0.415-0.086-0.675-0.086				c-0.225,0-0.427,0.028-0.607,0.086s-0.334,0.137-0.461,0.236s-0.225,0.216-0.292,0.349s-0.101,0.276-0.101,0.432				c0,0.194,0.056,0.357,0.168,0.487c0.113,0.13,0.261,0.242,0.446,0.337c0.185,0.096,0.395,0.18,0.63,0.252				c0.235,0.072,0.476,0.149,0.724,0.232c0.248,0.082,0.489,0.174,0.724,0.273c0.235,0.101,0.445,0.226,0.63,0.375				c0.185,0.15,0.334,0.334,0.446,0.552c0.113,0.217,0.169,0.479,0.169,0.783c0,0.351-0.062,0.674-0.188,0.972				c-0.125,0.297-0.31,0.555-0.555,0.772s-0.545,0.389-0.9,0.514s-0.765,0.188-1.23,0.188c-0.53,0-1.01-0.086-1.44-0.259				c-0.43-0.173-0.795-0.394-1.095-0.664l0.315-0.51c0.04-0.064,0.087-0.115,0.143-0.15c0.055-0.034,0.127-0.052,0.218-0.052				c0.09,0,0.185,0.035,0.285,0.104c0.1,0.07,0.222,0.147,0.364,0.232c0.143,0.085,0.315,0.163,0.518,0.232				c0.203,0.07,0.457,0.105,0.761,0.105c0.26,0,0.488-0.034,0.683-0.102s0.357-0.158,0.487-0.273				c0.13-0.115,0.227-0.248,0.289-0.397c0.062-0.15,0.094-0.311,0.094-0.48c0-0.21-0.056-0.384-0.169-0.521				c-0.112-0.138-0.261-0.256-0.446-0.353c-0.185-0.098-0.396-0.183-0.634-0.256c-0.237-0.072-0.48-0.148-0.728-0.229				c-0.247-0.08-0.49-0.171-0.728-0.273c-0.237-0.103-0.449-0.231-0.633-0.387c-0.185-0.154-0.334-0.346-0.446-0.573				c-0.113-0.228-0.169-0.504-0.169-0.829c0-0.29,0.06-0.568,0.18-0.836c0.12-0.268,0.295-0.503,0.525-0.705				s0.512-0.364,0.848-0.483c0.334-0.12,0.717-0.181,1.147-0.181c0.5,0,0.949,0.079,1.346,0.236s0.741,0.374,1.031,0.649				L31.095,58.727z"/></g>		<g class="st50">			<path class="st51" d="M0.63,103.055v-7.598h0.765c0.145,0,0.245,0.027,0.3,0.083c0.055,0.055,0.092,0.149,0.112,0.284l0.09,1.186				c0.26-0.53,0.582-0.943,0.964-1.241c0.383-0.298,0.831-0.446,1.346-0.446c0.21,0,0.4,0.023,0.57,0.071				c0.17,0.048,0.327,0.113,0.472,0.198L5.078,96.59c-0.035,0.125-0.112,0.188-0.232,0.188c-0.07,0-0.178-0.023-0.323-0.071				s-0.347-0.071-0.607-0.071c-0.465,0-0.854,0.135-1.166,0.405c-0.312,0.27-0.574,0.662-0.784,1.177v4.838H0.63z"/><path class="st51" d="M11.97,103.055h-0.592c-0.13,0-0.235-0.02-0.315-0.06s-0.133-0.125-0.158-0.256l-0.15-0.704				c-0.2,0.18-0.395,0.341-0.585,0.483s-0.39,0.263-0.6,0.36c-0.21,0.097-0.434,0.171-0.671,0.221				c-0.237,0.05-0.501,0.075-0.791,0.075c-0.295,0-0.571-0.042-0.829-0.124c-0.258-0.083-0.481-0.207-0.671-0.373				c-0.19-0.165-0.341-0.375-0.454-0.628c-0.113-0.254-0.169-0.554-0.169-0.899c0-0.301,0.083-0.591,0.248-0.869				s0.431-0.525,0.799-0.741c0.367-0.216,0.849-0.393,1.444-0.531c0.595-0.138,1.322-0.207,2.182-0.207v-0.596				c0-0.594-0.126-1.043-0.378-1.348c-0.252-0.304-0.626-0.456-1.122-0.456c-0.325,0-0.599,0.041-0.821,0.124				c-0.222,0.082-0.415,0.175-0.577,0.277c-0.163,0.103-0.303,0.194-0.42,0.277c-0.118,0.082-0.234,0.124-0.349,0.124				c-0.09,0-0.168-0.024-0.236-0.071c-0.068-0.048-0.122-0.106-0.162-0.177l-0.24-0.428c0.42-0.404,0.873-0.707,1.357-0.907				s1.022-0.3,1.612-0.3c0.425,0,0.803,0.07,1.133,0.21s0.607,0.335,0.833,0.585c0.225,0.25,0.395,0.553,0.51,0.907				c0.115,0.355,0.172,0.745,0.172,1.17V103.055z M8.505,102.237c0.235,0,0.45-0.023,0.645-0.071s0.379-0.115,0.551-0.202				c0.172-0.088,0.337-0.194,0.495-0.319c0.157-0.125,0.311-0.268,0.461-0.428v-1.567c-0.615,0-1.137,0.039-1.567,0.117				s-0.78,0.18-1.05,0.306s-0.466,0.274-0.589,0.445s-0.184,0.361-0.184,0.573c0,0.201,0.032,0.374,0.097,0.521				c0.065,0.146,0.153,0.265,0.263,0.358c0.11,0.093,0.24,0.161,0.39,0.203C8.168,102.216,8.331,102.237,8.505,102.237z"/><path class="st51" d="M13.995,103.055v-7.598h0.795c0.19,0,0.31,0.093,0.36,0.277l0.098,0.78c0.28-0.345,0.594-0.627,0.941-0.848				c0.348-0.22,0.751-0.33,1.211-0.33c0.515,0,0.931,0.143,1.249,0.428c0.318,0.285,0.546,0.67,0.687,1.155				c0.105-0.275,0.244-0.513,0.416-0.713c0.173-0.2,0.366-0.365,0.582-0.495c0.215-0.13,0.443-0.225,0.686-0.285				c0.243-0.06,0.489-0.09,0.739-0.09c0.4,0,0.756,0.064,1.069,0.191c0.312,0.128,0.578,0.313,0.795,0.559				c0.218,0.245,0.384,0.547,0.499,0.904c0.115,0.357,0.172,0.766,0.172,1.226v4.838h-1.335v-4.838c0-0.595-0.13-1.046-0.39-1.354				c-0.26-0.308-0.638-0.461-1.132-0.461c-0.22,0-0.429,0.039-0.626,0.116s-0.371,0.191-0.521,0.341				c-0.15,0.15-0.269,0.339-0.356,0.566S19.8,97.917,19.8,98.217v4.838h-1.335v-4.838c0-0.609-0.123-1.064-0.368-1.364				c-0.245-0.301-0.603-0.45-1.072-0.45c-0.33,0-0.636,0.089-0.919,0.266c-0.282,0.178-0.541,0.419-0.776,0.725v5.662H13.995z"/><path class="st51" d="M31.89,103.055h-0.592c-0.13,0-0.235-0.02-0.315-0.06s-0.133-0.125-0.158-0.256l-0.15-0.704				c-0.2,0.18-0.395,0.341-0.585,0.483s-0.39,0.263-0.6,0.36c-0.21,0.097-0.434,0.171-0.671,0.221				c-0.237,0.05-0.501,0.075-0.791,0.075c-0.295,0-0.571-0.042-0.829-0.124c-0.258-0.083-0.481-0.207-0.671-0.373				c-0.19-0.165-0.341-0.375-0.454-0.628c-0.113-0.254-0.169-0.554-0.169-0.899c0-0.301,0.083-0.591,0.248-0.869				s0.431-0.525,0.799-0.741c0.367-0.216,0.849-0.393,1.444-0.531c0.595-0.138,1.322-0.207,2.182-0.207v-0.596				c0-0.594-0.126-1.043-0.378-1.348c-0.252-0.304-0.626-0.456-1.122-0.456c-0.325,0-0.599,0.041-0.821,0.124				c-0.222,0.082-0.415,0.175-0.577,0.277c-0.163,0.103-0.303,0.194-0.42,0.277c-0.118,0.082-0.234,0.124-0.349,0.124				c-0.09,0-0.168-0.024-0.236-0.071c-0.068-0.048-0.122-0.106-0.162-0.177l-0.24-0.428c0.42-0.404,0.873-0.707,1.357-0.907				s1.022-0.3,1.612-0.3c0.425,0,0.803,0.07,1.133,0.21s0.607,0.335,0.833,0.585c0.225,0.25,0.395,0.553,0.51,0.907				c0.115,0.355,0.172,0.745,0.172,1.17V103.055z M28.425,102.237c0.235,0,0.45-0.023,0.645-0.071s0.379-0.115,0.551-0.202				c0.172-0.088,0.337-0.194,0.495-0.319c0.157-0.125,0.311-0.268,0.461-0.428v-1.567c-0.615,0-1.137,0.039-1.567,0.117				s-0.78,0.18-1.05,0.306s-0.466,0.274-0.589,0.445s-0.184,0.361-0.184,0.573c0,0.201,0.032,0.374,0.097,0.521				c0.065,0.146,0.153,0.265,0.263,0.358c0.11,0.093,0.24,0.161,0.39,0.203C28.087,102.216,28.25,102.237,28.425,102.237z"/><path class="st51" d="M39.217,96.027c0,0.095-0.018,0.187-0.052,0.273c-0.035,0.088-0.08,0.166-0.135,0.236l-4.11,5.475h4.147				v1.043h-5.723V102.5c0-0.065,0.016-0.142,0.049-0.229c0.033-0.087,0.079-0.171,0.139-0.251l4.133-5.513h-4.088v-1.05h5.64V96.027				z"/><path class="st51" d="M43.852,95.337c0.455,0,0.875,0.076,1.26,0.229c0.385,0.152,0.718,0.372,0.998,0.659				c0.28,0.288,0.499,0.643,0.656,1.065c0.158,0.423,0.236,0.903,0.236,1.443c0,0.21-0.022,0.351-0.067,0.42				c-0.045,0.07-0.13,0.105-0.255,0.105h-5.055c0.01,0.479,0.075,0.897,0.195,1.252c0.12,0.355,0.285,0.651,0.495,0.89				c0.21,0.237,0.46,0.415,0.75,0.532s0.615,0.176,0.975,0.176c0.335,0,0.624-0.038,0.866-0.116				c0.243-0.077,0.451-0.161,0.626-0.251c0.175-0.09,0.321-0.174,0.438-0.251c0.118-0.078,0.219-0.116,0.304-0.116				c0.11,0,0.195,0.042,0.255,0.127l0.375,0.487c-0.165,0.2-0.362,0.374-0.592,0.521s-0.476,0.269-0.739,0.364				c-0.263,0.095-0.534,0.166-0.814,0.214c-0.28,0.047-0.557,0.071-0.832,0.071c-0.525,0-1.009-0.089-1.452-0.267				c-0.442-0.178-0.825-0.438-1.147-0.78c-0.322-0.342-0.574-0.766-0.753-1.271c-0.18-0.505-0.27-1.085-0.27-1.739				c0-0.53,0.081-1.025,0.244-1.485c0.162-0.46,0.396-0.858,0.701-1.196c0.305-0.338,0.677-0.603,1.118-0.795				C42.807,95.434,43.302,95.337,43.852,95.337z M43.882,96.319c-0.645,0-1.152,0.187-1.522,0.56c-0.37,0.372-0.6,0.889-0.69,1.548				h4.133c0-0.31-0.043-0.593-0.128-0.851s-0.21-0.48-0.375-0.668s-0.366-0.332-0.604-0.435				C44.458,96.371,44.187,96.319,43.882,96.319z"/></g>		<g class="st50">			<path class="st52" d="M0.63,141.045v-7.598h0.765c0.145,0,0.245,0.027,0.3,0.083c0.055,0.055,0.092,0.149,0.112,0.284L1.897,135				c0.26-0.53,0.582-0.943,0.964-1.241c0.383-0.298,0.831-0.446,1.346-0.446c0.21,0,0.4,0.023,0.57,0.071				c0.17,0.048,0.327,0.113,0.472,0.198l-0.172,0.998c-0.035,0.125-0.112,0.188-0.232,0.188c-0.07,0-0.178-0.023-0.323-0.071				s-0.347-0.071-0.607-0.071c-0.465,0-0.854,0.135-1.166,0.405c-0.312,0.27-0.574,0.662-0.784,1.177v4.838H0.63z"/><path class="st52" d="M11.97,141.045h-0.592c-0.13,0-0.235-0.02-0.315-0.06s-0.133-0.125-0.158-0.256l-0.15-0.704				c-0.2,0.18-0.395,0.341-0.585,0.483s-0.39,0.263-0.6,0.36c-0.21,0.097-0.434,0.171-0.671,0.221				c-0.237,0.05-0.501,0.075-0.791,0.075c-0.295,0-0.571-0.042-0.829-0.124c-0.258-0.083-0.481-0.207-0.671-0.373				c-0.19-0.165-0.341-0.375-0.454-0.628c-0.113-0.254-0.169-0.554-0.169-0.899c0-0.301,0.083-0.591,0.248-0.869				s0.431-0.525,0.799-0.741c0.367-0.216,0.849-0.393,1.444-0.531c0.595-0.138,1.322-0.207,2.182-0.207v-0.596				c0-0.594-0.126-1.043-0.378-1.348c-0.252-0.304-0.626-0.456-1.122-0.456c-0.325,0-0.599,0.041-0.821,0.124				c-0.222,0.082-0.415,0.175-0.577,0.277c-0.163,0.103-0.303,0.194-0.42,0.277c-0.118,0.082-0.234,0.124-0.349,0.124				c-0.09,0-0.168-0.024-0.236-0.071c-0.068-0.048-0.122-0.106-0.162-0.177l-0.24-0.428c0.42-0.404,0.873-0.707,1.357-0.907				s1.022-0.3,1.612-0.3c0.425,0,0.803,0.07,1.133,0.21s0.607,0.335,0.833,0.585c0.225,0.25,0.395,0.553,0.51,0.907				c0.115,0.355,0.172,0.745,0.172,1.17V141.045z M8.505,140.228c0.235,0,0.45-0.023,0.645-0.071s0.379-0.115,0.551-0.202				c0.172-0.088,0.337-0.194,0.495-0.319c0.157-0.125,0.311-0.268,0.461-0.428v-1.567c-0.615,0-1.137,0.039-1.567,0.117				s-0.78,0.18-1.05,0.306s-0.466,0.274-0.589,0.445s-0.184,0.361-0.184,0.573c0,0.201,0.032,0.374,0.097,0.521				c0.065,0.146,0.153,0.265,0.263,0.358c0.11,0.093,0.24,0.161,0.39,0.203C8.168,140.206,8.331,140.228,8.505,140.228z"/><path class="st52" d="M15.78,131.062c0,0.13-0.026,0.251-0.079,0.363c-0.053,0.113-0.123,0.213-0.21,0.301				c-0.087,0.087-0.189,0.156-0.304,0.206c-0.115,0.05-0.238,0.075-0.368,0.075s-0.251-0.025-0.364-0.075				c-0.112-0.05-0.212-0.119-0.3-0.206c-0.087-0.088-0.156-0.188-0.207-0.301c-0.05-0.112-0.075-0.233-0.075-0.363				s0.025-0.254,0.075-0.371c0.05-0.117,0.119-0.22,0.207-0.308s0.188-0.156,0.3-0.206c0.113-0.05,0.234-0.075,0.364-0.075				s0.252,0.025,0.368,0.075c0.115,0.05,0.216,0.118,0.304,0.206s0.157,0.19,0.21,0.308C15.753,130.809,15.78,130.933,15.78,131.062				z M15.48,133.447v7.598h-1.335v-7.598H15.48z"/><path class="st52" d="M19.32,129.997v11.048h-1.335v-11.048H19.32z"/><path class="st52" d="M26.025,134.7c-0.06,0.109-0.152,0.165-0.277,0.165c-0.075,0-0.16-0.027-0.255-0.083				c-0.095-0.055-0.211-0.116-0.349-0.184c-0.138-0.067-0.301-0.13-0.492-0.188c-0.19-0.058-0.415-0.086-0.675-0.086				c-0.225,0-0.427,0.028-0.607,0.086s-0.334,0.137-0.461,0.236s-0.225,0.216-0.292,0.349s-0.101,0.276-0.101,0.432				c0,0.194,0.056,0.357,0.168,0.487c0.113,0.13,0.261,0.242,0.446,0.337c0.185,0.096,0.395,0.18,0.63,0.252				c0.235,0.072,0.476,0.149,0.724,0.232c0.248,0.082,0.489,0.174,0.724,0.273c0.235,0.101,0.445,0.226,0.63,0.375				c0.185,0.15,0.334,0.334,0.446,0.552c0.113,0.217,0.169,0.479,0.169,0.783c0,0.351-0.062,0.674-0.188,0.972				c-0.125,0.297-0.31,0.555-0.555,0.772s-0.545,0.389-0.9,0.514s-0.765,0.188-1.23,0.188c-0.53,0-1.01-0.086-1.44-0.259				c-0.43-0.173-0.795-0.394-1.095-0.664l0.315-0.51c0.04-0.064,0.087-0.115,0.143-0.15c0.055-0.034,0.127-0.052,0.218-0.052				c0.09,0,0.185,0.035,0.285,0.104c0.1,0.07,0.222,0.147,0.364,0.232c0.143,0.085,0.315,0.163,0.518,0.232				c0.203,0.07,0.457,0.105,0.761,0.105c0.26,0,0.488-0.034,0.683-0.102s0.357-0.158,0.487-0.273				c0.13-0.115,0.227-0.248,0.289-0.397c0.062-0.15,0.094-0.311,0.094-0.48c0-0.21-0.056-0.384-0.169-0.521				c-0.112-0.138-0.261-0.256-0.446-0.353c-0.185-0.098-0.396-0.183-0.634-0.256c-0.237-0.072-0.48-0.148-0.728-0.229				c-0.247-0.08-0.49-0.171-0.728-0.273c-0.237-0.103-0.449-0.231-0.633-0.387c-0.185-0.154-0.334-0.346-0.446-0.573				c-0.113-0.228-0.169-0.504-0.169-0.829c0-0.29,0.06-0.568,0.18-0.836c0.12-0.268,0.295-0.503,0.525-0.705				s0.512-0.364,0.848-0.483c0.334-0.12,0.717-0.181,1.147-0.181c0.5,0,0.949,0.079,1.346,0.236s0.741,0.374,1.031,0.649				L26.025,134.7z"/></g>		<g class="st50">			<path class="st51" d="M88.093,27.079v-6.457l-0.84-0.098c-0.105-0.025-0.191-0.064-0.259-0.116				c-0.068-0.053-0.102-0.129-0.102-0.229v-0.547h1.2v-0.735c0-0.435,0.061-0.821,0.184-1.158c0.123-0.338,0.297-0.623,0.525-0.855				s0.501-0.409,0.821-0.528c0.32-0.12,0.68-0.181,1.08-0.181c0.34,0,0.655,0.051,0.945,0.15l-0.03,0.667				c-0.005,0.101-0.047,0.16-0.127,0.181c-0.08,0.02-0.192,0.029-0.337,0.029h-0.232c-0.23,0-0.439,0.03-0.626,0.091				c-0.188,0.06-0.349,0.157-0.484,0.292c-0.135,0.135-0.239,0.312-0.311,0.532c-0.073,0.221-0.109,0.493-0.109,0.818v0.697h2.198				v0.967h-2.153v6.48H88.093z"/><path class="st51" d="M98.428,27.079h-0.592c-0.13,0-0.235-0.02-0.315-0.06s-0.133-0.125-0.158-0.256l-0.15-0.704				c-0.2,0.18-0.395,0.341-0.585,0.483s-0.39,0.263-0.6,0.36c-0.21,0.097-0.434,0.171-0.671,0.221				c-0.237,0.05-0.501,0.075-0.791,0.075c-0.295,0-0.571-0.042-0.829-0.124c-0.258-0.083-0.481-0.207-0.671-0.373				c-0.19-0.165-0.341-0.375-0.454-0.628c-0.113-0.254-0.169-0.554-0.169-0.899c0-0.301,0.083-0.591,0.248-0.869				s0.431-0.525,0.799-0.741c0.367-0.216,0.849-0.393,1.444-0.531c0.595-0.138,1.322-0.207,2.182-0.207V22.23				c0-0.594-0.126-1.043-0.378-1.348c-0.252-0.304-0.626-0.456-1.122-0.456c-0.325,0-0.599,0.041-0.821,0.124				c-0.222,0.082-0.415,0.175-0.577,0.277c-0.163,0.103-0.303,0.194-0.42,0.277c-0.118,0.082-0.234,0.124-0.349,0.124				c-0.09,0-0.168-0.024-0.236-0.071c-0.068-0.048-0.122-0.106-0.162-0.177l-0.24-0.428c0.42-0.404,0.873-0.707,1.357-0.907				s1.022-0.3,1.612-0.3c0.425,0,0.803,0.07,1.133,0.21s0.607,0.335,0.833,0.585c0.225,0.25,0.395,0.553,0.51,0.907				c0.115,0.355,0.172,0.745,0.172,1.17V27.079z M94.963,26.262c0.235,0,0.45-0.023,0.645-0.071s0.379-0.115,0.551-0.202				c0.172-0.088,0.337-0.194,0.495-0.319c0.157-0.125,0.311-0.268,0.461-0.428v-1.567c-0.615,0-1.137,0.039-1.567,0.117				s-0.78,0.18-1.05,0.306s-0.466,0.274-0.589,0.445s-0.184,0.361-0.184,0.573c0,0.201,0.032,0.374,0.097,0.521				c0.065,0.146,0.153,0.265,0.263,0.358c0.11,0.093,0.24,0.161,0.39,0.203C94.625,26.24,94.788,26.262,94.963,26.262z"/><path class="st51" d="M101.938,16.031v11.048h-1.335V16.031H101.938z"/><path class="st51" d="M108.643,20.734c-0.06,0.109-0.152,0.165-0.277,0.165c-0.075,0-0.16-0.027-0.255-0.083				c-0.095-0.055-0.211-0.116-0.349-0.184c-0.138-0.067-0.301-0.13-0.492-0.188c-0.19-0.058-0.415-0.086-0.675-0.086				c-0.225,0-0.427,0.028-0.607,0.086s-0.334,0.137-0.461,0.236s-0.225,0.216-0.292,0.349s-0.101,0.276-0.101,0.432				c0,0.194,0.056,0.357,0.168,0.487c0.113,0.13,0.261,0.242,0.446,0.337c0.185,0.096,0.395,0.18,0.63,0.252				c0.235,0.072,0.476,0.149,0.724,0.232c0.248,0.082,0.489,0.174,0.724,0.273c0.235,0.101,0.445,0.226,0.63,0.375				c0.185,0.15,0.334,0.334,0.446,0.552c0.113,0.217,0.169,0.479,0.169,0.783c0,0.351-0.062,0.674-0.188,0.972				c-0.125,0.297-0.31,0.555-0.555,0.772s-0.545,0.389-0.9,0.514s-0.765,0.188-1.23,0.188c-0.53,0-1.01-0.086-1.44-0.259				c-0.43-0.173-0.795-0.394-1.095-0.664l0.315-0.51c0.04-0.064,0.087-0.115,0.143-0.15c0.055-0.034,0.127-0.052,0.218-0.052				c0.09,0,0.185,0.035,0.285,0.104c0.1,0.07,0.222,0.147,0.364,0.232c0.143,0.085,0.315,0.163,0.518,0.232				c0.203,0.07,0.457,0.105,0.761,0.105c0.26,0,0.488-0.034,0.683-0.102s0.357-0.158,0.487-0.273				c0.13-0.115,0.227-0.248,0.289-0.397c0.062-0.15,0.094-0.311,0.094-0.48c0-0.21-0.056-0.384-0.169-0.521				c-0.112-0.138-0.261-0.256-0.446-0.353c-0.185-0.098-0.396-0.183-0.634-0.256c-0.237-0.072-0.48-0.148-0.728-0.229				c-0.247-0.08-0.49-0.171-0.728-0.273c-0.237-0.103-0.449-0.231-0.633-0.387c-0.185-0.154-0.334-0.346-0.446-0.573				c-0.113-0.228-0.169-0.504-0.169-0.829c0-0.29,0.06-0.568,0.18-0.836c0.12-0.268,0.295-0.503,0.525-0.705				s0.512-0.364,0.848-0.483c0.334-0.12,0.717-0.181,1.147-0.181c0.5,0,0.949,0.079,1.346,0.236s0.741,0.374,1.031,0.649				L108.643,20.734z"/><path class="st51" d="M113.81,19.361c0.455,0,0.875,0.076,1.26,0.229c0.385,0.152,0.718,0.372,0.998,0.659				c0.28,0.288,0.499,0.643,0.656,1.065c0.158,0.423,0.236,0.903,0.236,1.443c0,0.21-0.022,0.351-0.067,0.42				c-0.045,0.07-0.13,0.105-0.255,0.105h-5.055c0.01,0.479,0.075,0.897,0.195,1.252c0.12,0.355,0.285,0.651,0.495,0.89				c0.21,0.237,0.46,0.415,0.75,0.532s0.615,0.176,0.975,0.176c0.335,0,0.624-0.038,0.866-0.116				c0.243-0.077,0.451-0.161,0.626-0.251c0.175-0.09,0.321-0.174,0.438-0.251c0.118-0.078,0.219-0.116,0.304-0.116				c0.11,0,0.195,0.042,0.255,0.127l0.375,0.487c-0.165,0.2-0.362,0.374-0.592,0.521s-0.476,0.269-0.739,0.364				c-0.263,0.095-0.534,0.166-0.814,0.214c-0.28,0.047-0.557,0.071-0.832,0.071c-0.525,0-1.009-0.089-1.452-0.267				c-0.442-0.178-0.825-0.438-1.147-0.78c-0.322-0.342-0.574-0.766-0.753-1.271c-0.18-0.505-0.27-1.085-0.27-1.739				c0-0.53,0.081-1.025,0.244-1.485c0.162-0.46,0.396-0.858,0.701-1.196c0.305-0.338,0.677-0.603,1.118-0.795				C112.765,19.458,113.26,19.361,113.81,19.361z M113.84,20.344c-0.645,0-1.152,0.187-1.522,0.56c-0.37,0.372-0.6,0.889-0.69,1.548				h4.133c0-0.31-0.043-0.593-0.128-0.851s-0.21-0.48-0.375-0.668s-0.366-0.332-0.604-0.435				C114.416,20.396,114.145,20.344,113.84,20.344z"/></g>		<g class="st50">			<path class="st51" d="M88.093,66.071v-6.457l-0.84-0.098c-0.105-0.025-0.191-0.064-0.259-0.116				c-0.068-0.053-0.102-0.129-0.102-0.229v-0.547h1.2v-0.735c0-0.435,0.061-0.821,0.184-1.158c0.123-0.338,0.297-0.623,0.525-0.855				s0.501-0.409,0.821-0.528c0.32-0.12,0.68-0.181,1.08-0.181c0.34,0,0.655,0.051,0.945,0.15l-0.03,0.667				c-0.005,0.101-0.047,0.16-0.127,0.181c-0.08,0.02-0.192,0.029-0.337,0.029h-0.232c-0.23,0-0.439,0.03-0.626,0.091				c-0.188,0.06-0.349,0.157-0.484,0.292c-0.135,0.135-0.239,0.312-0.311,0.532c-0.073,0.221-0.109,0.493-0.109,0.818v0.697h2.198				v0.967h-2.153v6.48H88.093z"/><path class="st51" d="M98.428,66.071h-0.592c-0.13,0-0.235-0.02-0.315-0.06s-0.133-0.125-0.158-0.256l-0.15-0.704				c-0.2,0.18-0.395,0.341-0.585,0.483s-0.39,0.263-0.6,0.36c-0.21,0.097-0.434,0.171-0.671,0.221				c-0.237,0.05-0.501,0.075-0.791,0.075c-0.295,0-0.571-0.042-0.829-0.124c-0.258-0.083-0.481-0.207-0.671-0.373				c-0.19-0.165-0.341-0.375-0.454-0.628c-0.113-0.254-0.169-0.554-0.169-0.899c0-0.301,0.083-0.591,0.248-0.869				s0.431-0.525,0.799-0.741c0.367-0.216,0.849-0.393,1.444-0.531c0.595-0.138,1.322-0.207,2.182-0.207v-0.596				c0-0.594-0.126-1.043-0.378-1.348c-0.252-0.304-0.626-0.456-1.122-0.456c-0.325,0-0.599,0.041-0.821,0.124				c-0.222,0.082-0.415,0.175-0.577,0.277c-0.163,0.103-0.303,0.194-0.42,0.277c-0.118,0.082-0.234,0.124-0.349,0.124				c-0.09,0-0.168-0.024-0.236-0.071c-0.068-0.048-0.122-0.106-0.162-0.177l-0.24-0.428c0.42-0.404,0.873-0.707,1.357-0.907				s1.022-0.3,1.612-0.3c0.425,0,0.803,0.07,1.133,0.21s0.607,0.335,0.833,0.585c0.225,0.25,0.395,0.553,0.51,0.907				c0.115,0.355,0.172,0.745,0.172,1.17V66.071z M94.963,65.254c0.235,0,0.45-0.023,0.645-0.071s0.379-0.115,0.551-0.202				c0.172-0.088,0.337-0.194,0.495-0.319c0.157-0.125,0.311-0.268,0.461-0.428v-1.567c-0.615,0-1.137,0.039-1.567,0.117				s-0.78,0.18-1.05,0.306s-0.466,0.274-0.589,0.445s-0.184,0.361-0.184,0.573c0,0.201,0.032,0.374,0.097,0.521				c0.065,0.146,0.153,0.265,0.263,0.358c0.11,0.093,0.24,0.161,0.39,0.203C94.625,65.232,94.788,65.254,94.963,65.254z"/><path class="st51" d="M101.938,55.023v11.048h-1.335V55.023H101.938z"/><path class="st51" d="M108.643,59.727c-0.06,0.109-0.152,0.165-0.277,0.165c-0.075,0-0.16-0.027-0.255-0.083				c-0.095-0.055-0.211-0.116-0.349-0.184c-0.138-0.067-0.301-0.13-0.492-0.188c-0.19-0.058-0.415-0.086-0.675-0.086				c-0.225,0-0.427,0.028-0.607,0.086s-0.334,0.137-0.461,0.236s-0.225,0.216-0.292,0.349s-0.101,0.276-0.101,0.432				c0,0.194,0.056,0.357,0.168,0.487c0.113,0.13,0.261,0.242,0.446,0.337c0.185,0.096,0.395,0.18,0.63,0.252				c0.235,0.072,0.476,0.149,0.724,0.232c0.248,0.082,0.489,0.174,0.724,0.273c0.235,0.101,0.445,0.226,0.63,0.375				c0.185,0.15,0.334,0.334,0.446,0.552c0.113,0.217,0.169,0.479,0.169,0.783c0,0.351-0.062,0.674-0.188,0.972				c-0.125,0.297-0.31,0.555-0.555,0.772s-0.545,0.389-0.9,0.514s-0.765,0.188-1.23,0.188c-0.53,0-1.01-0.086-1.44-0.259				c-0.43-0.173-0.795-0.394-1.095-0.664l0.315-0.51c0.04-0.064,0.087-0.115,0.143-0.15c0.055-0.034,0.127-0.052,0.218-0.052				c0.09,0,0.185,0.035,0.285,0.104c0.1,0.07,0.222,0.147,0.364,0.232c0.143,0.085,0.315,0.163,0.518,0.232				c0.203,0.07,0.457,0.105,0.761,0.105c0.26,0,0.488-0.034,0.683-0.102s0.357-0.158,0.487-0.273				c0.13-0.115,0.227-0.248,0.289-0.397c0.062-0.15,0.094-0.311,0.094-0.48c0-0.21-0.056-0.384-0.169-0.521				c-0.112-0.138-0.261-0.256-0.446-0.353c-0.185-0.098-0.396-0.183-0.634-0.256c-0.237-0.072-0.48-0.148-0.728-0.229				c-0.247-0.08-0.49-0.171-0.728-0.273c-0.237-0.103-0.449-0.231-0.633-0.387c-0.185-0.154-0.334-0.346-0.446-0.573				c-0.113-0.228-0.169-0.504-0.169-0.829c0-0.29,0.06-0.568,0.18-0.836c0.12-0.268,0.295-0.503,0.525-0.705				s0.512-0.364,0.848-0.483c0.334-0.12,0.717-0.181,1.147-0.181c0.5,0,0.949,0.079,1.346,0.236s0.741,0.374,1.031,0.649				L108.643,59.727z"/><path class="st51" d="M113.81,58.354c0.455,0,0.875,0.076,1.26,0.229c0.385,0.152,0.718,0.372,0.998,0.659				c0.28,0.288,0.499,0.643,0.656,1.065c0.158,0.423,0.236,0.903,0.236,1.443c0,0.21-0.022,0.351-0.067,0.42				c-0.045,0.07-0.13,0.105-0.255,0.105h-5.055c0.01,0.479,0.075,0.897,0.195,1.252c0.12,0.355,0.285,0.651,0.495,0.89				c0.21,0.237,0.46,0.415,0.75,0.532s0.615,0.176,0.975,0.176c0.335,0,0.624-0.038,0.866-0.116				c0.243-0.077,0.451-0.161,0.626-0.251c0.175-0.09,0.321-0.174,0.438-0.251c0.118-0.078,0.219-0.116,0.304-0.116				c0.11,0,0.195,0.042,0.255,0.127l0.375,0.487c-0.165,0.2-0.362,0.374-0.592,0.521s-0.476,0.269-0.739,0.364				c-0.263,0.095-0.534,0.166-0.814,0.214c-0.28,0.047-0.557,0.071-0.832,0.071c-0.525,0-1.009-0.089-1.452-0.267				c-0.442-0.178-0.825-0.438-1.147-0.78c-0.322-0.342-0.574-0.766-0.753-1.271c-0.18-0.505-0.27-1.085-0.27-1.739				c0-0.53,0.081-1.025,0.244-1.485c0.162-0.46,0.396-0.858,0.701-1.196c0.305-0.338,0.677-0.603,1.118-0.795				C112.765,58.45,113.26,58.354,113.81,58.354z M113.84,59.336c-0.645,0-1.152,0.187-1.522,0.56c-0.37,0.372-0.6,0.889-0.69,1.548				h4.133c0-0.31-0.043-0.593-0.128-0.851s-0.21-0.48-0.375-0.668s-0.366-0.332-0.604-0.435				C114.416,59.388,114.145,59.336,113.84,59.336z"/></g>		<g class="st50">			<path class="st51" d="M88.093,104.055v-6.457l-0.84-0.098c-0.105-0.025-0.191-0.064-0.259-0.116				c-0.068-0.053-0.102-0.129-0.102-0.229v-0.547h1.2v-0.735c0-0.435,0.061-0.821,0.184-1.158c0.123-0.338,0.297-0.623,0.525-0.855				s0.501-0.409,0.821-0.528c0.32-0.12,0.68-0.181,1.08-0.181c0.34,0,0.655,0.051,0.945,0.15l-0.03,0.667				c-0.005,0.101-0.047,0.16-0.127,0.181c-0.08,0.02-0.192,0.029-0.337,0.029h-0.232c-0.23,0-0.439,0.03-0.626,0.091				c-0.188,0.06-0.349,0.157-0.484,0.292c-0.135,0.135-0.239,0.312-0.311,0.532c-0.073,0.221-0.109,0.493-0.109,0.818v0.697h2.198				v0.967h-2.153v6.48H88.093z"/><path class="st51" d="M98.428,104.055h-0.592c-0.13,0-0.235-0.02-0.315-0.06s-0.133-0.125-0.158-0.256l-0.15-0.704				c-0.2,0.18-0.395,0.341-0.585,0.483s-0.39,0.263-0.6,0.36c-0.21,0.097-0.434,0.171-0.671,0.221				c-0.237,0.05-0.501,0.075-0.791,0.075c-0.295,0-0.571-0.042-0.829-0.124c-0.258-0.083-0.481-0.207-0.671-0.373				c-0.19-0.165-0.341-0.375-0.454-0.628c-0.113-0.254-0.169-0.554-0.169-0.899c0-0.301,0.083-0.591,0.248-0.869				s0.431-0.525,0.799-0.741c0.367-0.216,0.849-0.393,1.444-0.531c0.595-0.138,1.322-0.207,2.182-0.207v-0.596				c0-0.594-0.126-1.043-0.378-1.348c-0.252-0.304-0.626-0.456-1.122-0.456c-0.325,0-0.599,0.041-0.821,0.124				c-0.222,0.082-0.415,0.175-0.577,0.277c-0.163,0.103-0.303,0.194-0.42,0.277c-0.118,0.082-0.234,0.124-0.349,0.124				c-0.09,0-0.168-0.024-0.236-0.071c-0.068-0.048-0.122-0.106-0.162-0.177l-0.24-0.428c0.42-0.404,0.873-0.707,1.357-0.907				s1.022-0.3,1.612-0.3c0.425,0,0.803,0.07,1.133,0.21s0.607,0.335,0.833,0.585c0.225,0.25,0.395,0.553,0.51,0.907				c0.115,0.355,0.172,0.745,0.172,1.17V104.055z M94.963,103.237c0.235,0,0.45-0.023,0.645-0.071s0.379-0.115,0.551-0.202				c0.172-0.088,0.337-0.194,0.495-0.319c0.157-0.125,0.311-0.268,0.461-0.428v-1.567c-0.615,0-1.137,0.039-1.567,0.117				s-0.78,0.18-1.05,0.306s-0.466,0.274-0.589,0.445s-0.184,0.361-0.184,0.573c0,0.201,0.032,0.374,0.097,0.521				c0.065,0.146,0.153,0.265,0.263,0.358c0.11,0.093,0.24,0.161,0.39,0.203C94.625,103.216,94.788,103.237,94.963,103.237z"/><path class="st51" d="M101.938,93.007v11.048h-1.335V93.007H101.938z"/><path class="st51" d="M108.643,97.71c-0.06,0.109-0.152,0.165-0.277,0.165c-0.075,0-0.16-0.027-0.255-0.083				c-0.095-0.055-0.211-0.116-0.349-0.184c-0.138-0.067-0.301-0.13-0.492-0.188c-0.19-0.058-0.415-0.086-0.675-0.086				c-0.225,0-0.427,0.028-0.607,0.086s-0.334,0.137-0.461,0.236s-0.225,0.216-0.292,0.349s-0.101,0.276-0.101,0.432				c0,0.194,0.056,0.357,0.168,0.487c0.113,0.13,0.261,0.242,0.446,0.337c0.185,0.096,0.395,0.18,0.63,0.252				c0.235,0.072,0.476,0.149,0.724,0.232c0.248,0.082,0.489,0.174,0.724,0.273c0.235,0.101,0.445,0.226,0.63,0.375				c0.185,0.15,0.334,0.334,0.446,0.552c0.113,0.217,0.169,0.479,0.169,0.783c0,0.351-0.062,0.674-0.188,0.972				c-0.125,0.297-0.31,0.555-0.555,0.772s-0.545,0.389-0.9,0.514s-0.765,0.188-1.23,0.188c-0.53,0-1.01-0.086-1.44-0.259				c-0.43-0.173-0.795-0.394-1.095-0.664l0.315-0.51c0.04-0.064,0.087-0.115,0.143-0.15c0.055-0.034,0.127-0.052,0.218-0.052				c0.09,0,0.185,0.035,0.285,0.104c0.1,0.07,0.222,0.147,0.364,0.232c0.143,0.085,0.315,0.163,0.518,0.232				c0.203,0.07,0.457,0.105,0.761,0.105c0.26,0,0.488-0.034,0.683-0.102s0.357-0.158,0.487-0.273				c0.13-0.115,0.227-0.248,0.289-0.397c0.062-0.15,0.094-0.311,0.094-0.48c0-0.21-0.056-0.384-0.169-0.521				c-0.112-0.138-0.261-0.256-0.446-0.353c-0.185-0.098-0.396-0.183-0.634-0.256c-0.237-0.072-0.48-0.148-0.728-0.229				c-0.247-0.08-0.49-0.171-0.728-0.273c-0.237-0.103-0.449-0.231-0.633-0.387c-0.185-0.154-0.334-0.346-0.446-0.573				c-0.113-0.228-0.169-0.504-0.169-0.829c0-0.29,0.06-0.568,0.18-0.836c0.12-0.268,0.295-0.503,0.525-0.705				s0.512-0.364,0.848-0.483c0.334-0.12,0.717-0.181,1.147-0.181c0.5,0,0.949,0.079,1.346,0.236s0.741,0.374,1.031,0.649				L108.643,97.71z"/><path class="st51" d="M113.81,96.337c0.455,0,0.875,0.076,1.26,0.229c0.385,0.152,0.718,0.372,0.998,0.659				c0.28,0.288,0.499,0.643,0.656,1.065c0.158,0.423,0.236,0.903,0.236,1.443c0,0.21-0.022,0.351-0.067,0.42				c-0.045,0.07-0.13,0.105-0.255,0.105h-5.055c0.01,0.479,0.075,0.897,0.195,1.252c0.12,0.355,0.285,0.651,0.495,0.89				c0.21,0.237,0.46,0.415,0.75,0.532s0.615,0.176,0.975,0.176c0.335,0,0.624-0.038,0.866-0.116				c0.243-0.077,0.451-0.161,0.626-0.251c0.175-0.09,0.321-0.174,0.438-0.251c0.118-0.078,0.219-0.116,0.304-0.116				c0.11,0,0.195,0.042,0.255,0.127l0.375,0.487c-0.165,0.2-0.362,0.374-0.592,0.521s-0.476,0.269-0.739,0.364				c-0.263,0.095-0.534,0.166-0.814,0.214c-0.28,0.047-0.557,0.071-0.832,0.071c-0.525,0-1.009-0.089-1.452-0.267				c-0.442-0.178-0.825-0.438-1.147-0.78c-0.322-0.342-0.574-0.766-0.753-1.271c-0.18-0.505-0.27-1.085-0.27-1.739				c0-0.53,0.081-1.025,0.244-1.485c0.162-0.46,0.396-0.858,0.701-1.196c0.305-0.338,0.677-0.603,1.118-0.795				C112.765,96.434,113.26,96.337,113.81,96.337z M113.84,97.319c-0.645,0-1.152,0.187-1.522,0.56c-0.37,0.372-0.6,0.889-0.69,1.548				h4.133c0-0.31-0.043-0.593-0.128-0.851s-0.21-0.48-0.375-0.668s-0.366-0.332-0.604-0.435				C114.416,97.371,114.145,97.319,113.84,97.319z"/></g>		<g class="st50">			<path class="st52" d="M85.27,132.84h2.532c0.382,0,0.653,0.069,0.813,0.207c0.161,0.139,0.241,0.368,0.241,0.689				c0,0.326-0.082,0.562-0.245,0.705c-0.164,0.145-0.433,0.217-0.81,0.217H85.27v2.125c0,0.598,0.091,1.007,0.274,1.229				c0.183,0.221,0.503,0.332,0.963,0.332c0.432,0,0.941-0.125,1.527-0.374s0.979-0.374,1.179-0.374c0.227,0,0.422,0.091,0.585,0.271				c0.164,0.18,0.245,0.396,0.245,0.651c0,0.426-0.386,0.814-1.158,1.166c-0.771,0.352-1.647,0.527-2.627,0.527				c-0.57,0-1.071-0.077-1.502-0.232s-0.772-0.376-1.021-0.664c-0.183-0.222-0.312-0.487-0.39-0.797s-0.116-0.827-0.116-1.553				v-0.182v-2.125h-0.78c-0.376,0-0.643-0.072-0.801-0.217c-0.157-0.144-0.236-0.379-0.236-0.705s0.078-0.558,0.232-0.693				s0.423-0.203,0.805-0.203h0.78v-1.942c0-0.382,0.079-0.65,0.237-0.806c0.157-0.154,0.419-0.232,0.784-0.232				s0.627,0.078,0.784,0.232c0.158,0.155,0.237,0.424,0.237,0.806V132.84z"/><path class="st52" d="M95.671,135.537v2.689h1.959c0.376,0,0.643,0.069,0.801,0.208c0.157,0.139,0.236,0.368,0.236,0.688				c0,0.327-0.079,0.562-0.236,0.706c-0.158,0.144-0.425,0.216-0.801,0.216h-4.64c-0.382,0-0.653-0.072-0.813-0.216				s-0.241-0.379-0.241-0.706c0-0.32,0.079-0.55,0.238-0.688c0.158-0.139,0.432-0.208,0.822-0.208h0.634v-4.033H93.27				c-0.379,0-0.647-0.071-0.806-0.212c-0.159-0.142-0.238-0.375-0.238-0.702c0-0.326,0.076-0.559,0.229-0.697				c0.152-0.138,0.422-0.207,0.809-0.207h1.768c0.149,0,0.266,0.032,0.349,0.096s0.125,0.15,0.125,0.262v1.229				c0.603-0.648,1.167-1.11,1.689-1.387c0.523-0.276,1.086-0.415,1.689-0.415c0.548,0,0.982,0.123,1.303,0.369				s0.481,0.577,0.481,0.992c0,0.321-0.111,0.585-0.332,0.793c-0.221,0.207-0.506,0.312-0.855,0.312				c-0.249,0-0.544-0.092-0.884-0.274c-0.341-0.183-0.577-0.274-0.71-0.274c-0.266,0-0.578,0.119-0.938,0.357				S96.164,135.039,95.671,135.537z"/><path class="st52" d="M107.558,134.193h-0.133c-0.299,0-0.524-0.078-0.677-0.232c-0.152-0.155-0.228-0.383-0.228-0.682				c0-0.326,0.078-0.559,0.232-0.697c0.155-0.138,0.423-0.207,0.805-0.207h1.569c0.149,0,0.266,0.032,0.349,0.096				s0.125,0.15,0.125,0.262v5.494h0.133c0.299,0,0.527,0.078,0.685,0.232c0.158,0.155,0.237,0.377,0.237,0.664				c0,0.332-0.08,0.569-0.241,0.71c-0.161,0.142-0.432,0.212-0.813,0.212h-1.395c-0.155,0-0.275-0.033-0.361-0.1				c-0.085-0.066-0.128-0.158-0.128-0.273v-0.631c-0.266,0.398-0.591,0.697-0.975,0.896c-0.385,0.199-0.837,0.299-1.357,0.299				c-0.891,0-1.552-0.269-1.984-0.806s-0.647-1.358-0.647-2.466v-2.771h-0.141c-0.299,0-0.526-0.078-0.681-0.232				c-0.155-0.155-0.232-0.383-0.232-0.682c0-0.326,0.079-0.559,0.236-0.697c0.158-0.138,0.431-0.207,0.818-0.207h1.561				c0.149,0,0.263,0.032,0.34,0.096s0.116,0.15,0.116,0.262v3.859c0,0.681,0.094,1.159,0.282,1.436				c0.188,0.277,0.498,0.416,0.93,0.416c0.459,0,0.837-0.171,1.133-0.511c0.296-0.341,0.444-0.787,0.444-1.341V134.193z"/><path class="st52" d="M114.19,136.699c0.144,0.615,0.422,1.074,0.834,1.379c0.413,0.304,0.962,0.456,1.648,0.456				s1.364-0.167,2.034-0.502s1.074-0.503,1.212-0.503c0.205,0,0.372,0.076,0.502,0.229c0.13,0.152,0.195,0.348,0.195,0.586				c0,0.52-0.385,0.968-1.154,1.344c-0.769,0.377-1.721,0.564-2.855,0.564c-1.339,0-2.428-0.376-3.266-1.129				c-0.839-0.752-1.258-1.721-1.258-2.904c0-1.18,0.419-2.145,1.258-2.897c0.838-0.753,1.927-1.129,3.266-1.129				c1.195,0,2.186,0.353,2.972,1.059c0.786,0.705,1.179,1.57,1.179,2.594c0,0.326-0.079,0.551-0.237,0.673				c-0.157,0.121-0.482,0.182-0.975,0.182H114.19z M118.664,135.404c-0.094-0.514-0.336-0.912-0.726-1.195				c-0.391-0.281-0.898-0.423-1.523-0.423c-0.603,0-1.089,0.134-1.457,0.402c-0.368,0.269-0.624,0.674-0.768,1.216H118.664z"/></g>		<g>			<path class="st55" d="M62.848,141.489c-0.268,0-0.512-0.06-0.732-0.156c-0.22-0.104-0.431-0.244-0.628-0.419l-3.695-3.713				c-0.187-0.188-0.326-0.398-0.419-0.645c-0.093-0.231-0.14-0.479-0.14-0.724s0.047-0.479,0.14-0.715				c0.093-0.232,0.232-0.438,0.419-0.609c0.186-0.187,0.397-0.329,0.636-0.428c0.239-0.101,0.479-0.148,0.724-0.148				s0.482,0.058,0.715,0.148c0.233,0.098,0.441,0.241,0.628,0.428l2.354,2.354l5.944-5.965c0.186-0.188,0.396-0.323,0.628-0.42				s0.474-0.144,0.724-0.144s0.49,0.047,0.724,0.144c0.232,0.097,0.441,0.229,0.627,0.42c0.187,0.188,0.323,0.396,0.41,0.63				c0.087,0.229,0.131,0.474,0.131,0.724s-0.044,0.491-0.131,0.724c-0.087,0.233-0.224,0.441-0.41,0.632l-7.305,7.308				c-0.174,0.175-0.375,0.312-0.602,0.419C63.363,141.44,63.114,141.489,62.848,141.489z"/></g>		<line class="st53" x1="57.312" y1="22.169" x2="68.312" y2="22.169"/><line class="st53" x1="57.312" y1="59.159" x2="68.312" y2="59.159"/><line class="st53" x1="57.312" y1="98.143" x2="68.312" y2="98.143"/><g>			<path class="st0" d="M312.055,13.055c-0.268,0-0.512-0.052-0.729-0.156c-0.228-0.104-0.438-0.236-0.628-0.419l-3.695-3.713				c-0.188-0.186-0.326-0.396-0.419-0.637s-0.14-0.479-0.14-0.724s0.047-0.481,0.14-0.715c0.093-0.232,0.229-0.438,0.419-0.609				c0.187-0.188,0.396-0.329,0.636-0.428c0.239-0.104,0.479-0.148,0.729-0.148c0.243,0,0.479,0.05,0.715,0.148				c0.229,0.098,0.438,0.233,0.628,0.428l2.354,2.354l5.943-5.963c0.188-0.186,0.396-0.325,0.628-0.418s0.479-0.14,0.729-0.14				s0.484,0.047,0.726,0.14c0.229,0.093,0.438,0.232,0.627,0.418c0.188,0.188,0.323,0.396,0.41,0.628s0.131,0.479,0.131,0.729				s-0.044,0.484-0.131,0.724s-0.229,0.441-0.41,0.627l-7.305,7.31c-0.179,0.178-0.375,0.312-0.604,0.422				C312.57,13.005,312.322,13.055,312.055,13.055z"/></g>		<g>			<polygon class="st15" points="382.856,78.481 273.597,134.795 164.337,78.481 273.597,22.163 			"/><polygon class="st15" points="360.582,78.479 273.597,123.315 186.611,78.479 273.597,33.643 			"/><polygon class="st16" points="212.341,69.325 190.595,80.52 186.719,78.479 208.468,67.284 			"/><polygon class="st16" points="235.606,64.444 205.005,80.217 201.13,78.176 231.732,62.403 			"/><polygon class="st16" points="242.521,68.008 211.919,83.78 208.044,81.739 238.646,65.965 			"/><polygon class="st16" points="249.433,71.569 218.833,87.344 214.957,85.303 245.556,69.528 			"/><polygon class="st16" points="243.904,85.607 222.158,96.803 218.284,94.762 240.031,83.567 			"/><polygon class="st16" points="267.172,80.727 236.568,96.503 232.693,94.458 263.294,78.686 			"/><polygon class="st16" points="274.084,84.29 243.482,100.065 239.606,98.022 270.207,82.251 			"/><polygon class="st16" points="280.996,87.854 250.394,103.628 246.518,101.586 277.119,85.813 			"/><polygon class="st16" points="274.372,101.309 252.625,112.504 248.749,110.465 270.496,99.27 			"/><polygon class="st16" points="297.637,96.43 267.037,112.204 263.16,110.163 293.761,94.387 			"/><polygon class="st16" points="304.552,99.993 273.949,115.766 270.072,113.725 300.675,97.952 			"/><polygon class="st16" points="311.464,103.555 280.862,119.329 276.985,117.29 307.587,101.514 			"/><polygon class="st16" points="261.197,44.385 239.452,55.581 235.576,53.54 257.322,42.342 			"/><polygon class="st16" points="284.462,39.503 253.863,55.278 249.988,53.237 280.587,37.461 			"/><polygon class="st16" points="291.376,43.065 260.776,58.838 256.899,56.797 287.501,41.026 			"/><polygon class="st16" points="298.291,46.628 267.687,62.403 263.812,60.362 294.415,44.588 			"/><polygon class="st16" points="292.761,60.667 271.013,71.862 267.138,69.821 288.884,58.628 			"/><polygon class="st16" points="316.025,55.788 285.423,71.561 281.548,69.52 312.15,53.745 			"/><polygon class="st16" points="322.938,59.35 292.337,75.124 288.46,73.081 319.064,57.311 			"/><polygon class="st16" points="329.851,62.915 299.249,78.686 295.373,76.645 325.976,60.87 			"/><polygon class="st16" points="323.228,76.37 301.48,87.565 297.606,85.524 319.352,74.329 			"/><polygon class="st16" points="346.492,71.491 315.892,87.264 312.017,85.223 342.617,69.448 			"/><polygon class="st16" points="353.404,75.051 322.804,90.827 318.928,88.786 349.529,73.012 			"/><polygon class="st16" points="360.32,78.616 329.718,94.387 325.839,92.348 356.443,76.575 			"/><polygon class="st17" points="273.597,134.795 382.856,78.481 382.856,82.61 273.597,138.924 			"/><polygon class="st18" points="273.597,134.795 164.337,78.481 164.337,82.61 273.597,138.924 			"/></g>		<g>			<circle class="st0" cx="328.647" cy="40.754" r="18.907"/><linearGradient id="SVGID_108_" gradientUnits="userSpaceOnUse" x1="25804.5" y1="3347.6616" x2="25797.8555" y2="3379.9355" gradientTransform="matrix(-1 0 0 -1 26122.8672 3420)">				<stop  offset="0" style="stop-color:#EF4B52"/><stop  offset="0.1648" style="stop-color:#EB4950"/><stop  offset="0.336" style="stop-color:#DE444A"/><stop  offset="0.5103" style="stop-color:#CA3B3F"/><stop  offset="0.6867" style="stop-color:#AC2F30"/><stop  offset="0.8629" style="stop-color:#871F1D"/><stop  offset="1" style="stop-color:#65110C"/></linearGradient>			<polygon class="st195" points="319.008,45.458 324.475,39.012 328.678,46.02 			"/><polygon class="st96" points="324.475,39.012 319.989,36.069 319.008,45.458 			"/><linearGradient id="SVGID_109_" gradientUnits="userSpaceOnUse" x1="25817.5254" y1="3373.1997" x2="25801.248" y2="3381.928" gradientTransform="matrix(-1 0 0 -1 26122.8672 3420)">				<stop  offset="0" style="stop-color:#EF4B52"/><stop  offset="0.1648" style="stop-color:#EB4950"/><stop  offset="0.336" style="stop-color:#DE444A"/><stop  offset="0.5103" style="stop-color:#CA3B3F"/><stop  offset="0.6867" style="stop-color:#AC2F30"/><stop  offset="0.8629" style="stop-color:#871F1D"/><stop  offset="1" style="stop-color:#65110C"/></linearGradient>			<polygon class="st196" points="318.904,45.458 314.228,39.012 319.783,33.126 319.783,36.069 			"/><polygon class="st98" points="338.348,45.458 332.883,39.012 328.678,46.02 			"/><polygon class="st96" points="332.883,39.012 337.365,36.069 338.348,45.458 			"/><polygon class="st96" points="332.883,39.012 337.365,36.069 338.348,45.458 			"/><linearGradient id="SVGID_110_" gradientUnits="userSpaceOnUse" x1="25783.5957" y1="3375.4207" x2="25786.3652" y2="3380.1213" gradientTransform="matrix(-1 0 0 -1 26122.8672 3420)">				<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>			<polygon class="st197" points="332.883,39.012 337.365,36.069 338.348,45.458 			"/><polygon class="st100" points="338.367,44.897 343.002,39.012 337.406,33.126 337.406,36.069 			"/><linearGradient id="SVGID_111_" gradientUnits="userSpaceOnUse" x1="25790.5195" y1="3384.22" x2="25782.4023" y2="3379.4849" gradientTransform="matrix(-1 0 0 -1 26122.8672 3420)">				<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>			<polygon class="st198" points="338.367,44.897 343.002,39.012 337.406,33.126 337.406,36.069 			"/><linearGradient id="SVGID_112_" gradientUnits="userSpaceOnUse" x1="25779.8105" y1="3378.0549" x2="25792.8711" y2="3385.4648" gradientTransform="matrix(-1 0 0 -1 26122.8672 3420)">				<stop  offset="0" style="stop-color:#62110B"/><stop  offset="0.172" style="stop-color:#66110D;stop-opacity:0.828"/><stop  offset="0.3508" style="stop-color:#731213;stop-opacity:0.6492"/><stop  offset="0.5327" style="stop-color:#87141D;stop-opacity:0.4673"/><stop  offset="0.7167" style="stop-color:#A5162B;stop-opacity:0.2833"/><stop  offset="0.9007" style="stop-color:#CA193D;stop-opacity:0.0993"/><stop  offset="1" style="stop-color:#E11B48;stop-opacity:0"/></linearGradient>			<polygon class="st199" points="338.367,44.897 343.002,39.012 337.406,33.126 337.406,36.069 			"/><linearGradient id="SVGID_113_" gradientUnits="userSpaceOnUse" x1="25790.7656" y1="3381.1797" x2="25795.5879" y2="3378.0005" gradientTransform="matrix(-1 0 0 -1 26122.8672 3420)">				<stop  offset="0" style="stop-color:#EE393F"/><stop  offset="1" style="stop-color:#AC2024"/></linearGradient>			<polygon class="st200" points="328.678,38.961 332.883,38.961 332.883,38.961 328.678,45.965 324.475,38.961 324.475,38.961 							"/><linearGradient id="SVGID_114_" gradientUnits="userSpaceOnUse" x1="25788.9434" y1="3374.3369" x2="25795.9492" y2="3381.4692" gradientTransform="matrix(-1 0 0 -1 26122.8672 3420)">				<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0.42"/></linearGradient>			<polygon class="st201" points="328.678,38.961 332.883,38.961 332.883,38.961 328.678,45.965 324.475,38.961 324.475,38.961 							"/><polygon class="st105" points="323.842,30.95 328.678,30.95 333.512,30.95 337.406,33.126 337.406,36.069 332.883,38.961 				328.678,38.961 324.475,38.961 319.783,36.069 319.783,33.126 			"/><linearGradient id="SVGID_115_" gradientUnits="userSpaceOnUse" x1="25806.0723" y1="3399.5393" x2="25793.0508" y2="3383.9395" gradientTransform="matrix(-1 0 0 -1 26122.8672 3420)">				<stop  offset="0" style="stop-color:#FFFFFF"/><stop  offset="1" style="stop-color:#FFFFFF;stop-opacity:0"/></linearGradient>			<polygon class="st202" points="323.842,30.95 328.678,30.95 333.512,30.95 337.406,33.126 337.406,36.069 332.883,38.961 				328.678,38.961 324.475,38.961 319.783,36.069 319.783,33.126 			"/><polygon class="st107" points="328.593,46.016 328.593,52.592 318.945,45.458 			"/><linearGradient id="SVGID_116_" gradientUnits="userSpaceOnUse" x1="25811.3691" y1="3361.4128" x2="25786.0703" y2="3374.9788" gradientTransform="matrix(-1 0 0 -1 26122.8672 3420)">				<stop  offset="0" style="stop-color:#EF4B52"/><stop  offset="0.1648" style="stop-color:#EB4950"/><stop  offset="0.336" style="stop-color:#DE444A"/><stop  offset="0.5103" style="stop-color:#CA3B3F"/><stop  offset="0.6867" style="stop-color:#AC2F30"/><stop  offset="0.8629" style="stop-color:#871F1D"/><stop  offset="1" style="stop-color:#65110C"/></linearGradient>			<polygon class="st203" points="328.593,46.17 328.678,46.17 338.348,45.534 328.645,52.643 328.593,52.592 			"/></g>		<g class="st50">			<path class="st0" d="M329.113,11.048V3.45h0.765c0.145,0,0.245,0.027,0.3,0.083c0.055,0.055,0.092,0.149,0.112,0.284l0.09,1.186				c0.26-0.53,0.582-0.943,0.964-1.241c0.383-0.298,0.831-0.446,1.346-0.446c0.21,0,0.4,0.023,0.57,0.071				c0.17,0.048,0.327,0.113,0.472,0.198l-0.172,0.998c-0.035,0.125-0.112,0.188-0.232,0.188c-0.07,0-0.178-0.023-0.323-0.071				s-0.347-0.071-0.607-0.071c-0.465,0-0.854,0.135-1.166,0.405c-0.312,0.27-0.574,0.662-0.784,1.177v4.838H329.113z"/><path class="st0" d="M336.313,3.45v4.845c0,0.575,0.132,1.021,0.397,1.335c0.265,0.315,0.665,0.473,1.2,0.473				c0.39,0,0.757-0.092,1.103-0.277c0.345-0.185,0.662-0.442,0.952-0.772V3.45h1.335v7.598h-0.795c-0.19,0-0.31-0.093-0.36-0.277				l-0.105-0.817c-0.33,0.365-0.7,0.658-1.11,0.881c-0.41,0.223-0.88,0.334-1.41,0.334c-0.415,0-0.781-0.069-1.099-0.206				c-0.318-0.138-0.584-0.331-0.799-0.582c-0.215-0.249-0.376-0.552-0.484-0.907c-0.107-0.354-0.161-0.747-0.161-1.178V3.45H336.313				z"/><path class="st0" d="M343.543,11.048V0h1.342v4.545c0.315-0.364,0.676-0.658,1.084-0.881c0.407-0.223,0.874-0.334,1.398-0.334				c0.44,0,0.837,0.083,1.193,0.248c0.355,0.165,0.657,0.411,0.907,0.738c0.25,0.328,0.442,0.732,0.578,1.215				c0.135,0.483,0.203,1.039,0.203,1.669c0,0.561-0.075,1.081-0.225,1.563c-0.15,0.483-0.366,0.9-0.649,1.253				s-0.627,0.63-1.035,0.832c-0.407,0.203-0.866,0.305-1.376,0.305c-0.49,0-0.906-0.096-1.249-0.285				c-0.342-0.19-0.641-0.455-0.896-0.795l-0.067,0.689c-0.04,0.19-0.155,0.285-0.345,0.285H343.543z M346.933,4.396				c-0.435,0-0.816,0.1-1.144,0.3s-0.629,0.482-0.904,0.848v3.675c0.24,0.33,0.506,0.562,0.799,0.697				c0.292,0.136,0.619,0.203,0.979,0.203c0.71,0,1.255-0.253,1.635-0.758s0.57-1.225,0.57-2.16c0-0.495-0.043-0.92-0.131-1.274				c-0.088-0.355-0.214-0.646-0.379-0.874s-0.368-0.394-0.607-0.499C347.51,4.448,347.238,4.396,346.933,4.396z"/><path class="st0" d="M353.916,13.29c-0.045,0.101-0.101,0.181-0.168,0.24c-0.067,0.061-0.171,0.09-0.312,0.09h-0.99l1.388-3.015				l-3.135-7.155h1.155c0.115,0,0.205,0.029,0.27,0.086c0.065,0.058,0.113,0.122,0.143,0.191l2.033,4.785				c0.045,0.11,0.083,0.221,0.116,0.33c0.032,0.11,0.061,0.223,0.086,0.338c0.035-0.115,0.07-0.228,0.105-0.338				c0.035-0.109,0.075-0.223,0.12-0.338l1.973-4.777c0.03-0.08,0.081-0.146,0.154-0.198c0.072-0.053,0.151-0.079,0.236-0.079h1.065				L353.916,13.29z"/></g>		<g>			<g>				<polyline class="st53" points="133.724,23.596 174.259,23.596 199.652,48.991 				"/><g>					<circle class="st51" cx="199.573" cy="48.911" r="2.256"/></g>			</g>		</g>		<g>			<g>				<polyline class="st53" points="135.726,56.889 160.895,56.889 169.335,65.329 				"/><g>					<circle class="st51" cx="169.255" cy="65.249" r="2.256"/></g>			</g>		</g>		<g>			<g>				<polyline class="st54" points="133.724,134.979 175.701,134.979 197.683,112.997 				"/><g>					<circle class="st55" cx="197.603" cy="113.077" r="2.256"/></g>			</g>		</g>		<g>			<g>				<polyline class="st53" points="136.727,102.128 161.896,102.128 169.335,94.688 				"/><g>					<circle class="st51" cx="169.255" cy="94.768" r="2.256"/></g>			</g>		</g>		<path class="st53" d="M242.681,161.61"/></g></g><g id="mad-scientist" data-size="256x144" class="nanobox-svg ">			<use xlink:href="#scientist"  width="182.983" height="141.655" x="-91.491" y="-70.827" transform="matrix(1 0 0 -1 91.4915 70.8275)" style="overflow:visible;"/><path class="st204" d="M187.916,85.95c-2.521,0-2.27-3.521,0-3.521c2.096,0,7.527,0,9.797,0c2.271,0,2.521,3.521,0,3.521		s-0.933,0-2.193,0v30.734c0,1.479-1.189,2.683-2.682,2.683c-1.479,0-2.686-1.201-2.686-2.683l0.027-30.734		C190.18,85.95,190.436,85.95,187.916,85.95z"/><path class="st204" d="M209.068,85.95c-2.521,0-2.271-3.521,0-3.521c2.096,0,7.521,0,9.799,0c2.268,0,2.52,3.521,0,3.521		c-2.521,0-0.938,0-2.195,0v30.734c0,1.479-1.199,2.683-2.682,2.683s-2.688-1.201-2.688-2.683l0.026-30.734		C211.332,85.95,211.59,85.95,209.068,85.95z"/><polyline class="st204" points="186.117,96.748 202.336,96.748 202.336,134.477 	"/><polyline class="st204" points="207.272,96.748 223.489,96.748 223.489,134.477 	"/><path class="st204" d="M230.223,85.95c-2.52,0-2.27-3.521,0-3.521c2.094,0,7.527,0,9.799,0s2.521,3.521,0,3.521s-0.935,0-2.188,0		v30.734c0,1.479-1.201,2.683-2.688,2.683c-1.479,0-2.688-1.201-2.688-2.683l0.021-30.734		C232.484,85.95,232.743,85.95,230.223,85.95z"/><polyline class="st204" points="228.426,96.748 244.643,96.748 244.643,134.477 	"/><line class="st204" x1="254.764" y1="134.477" x2="180.287" y2="134.477"/><line class="st204" x1="254.764" y1="139.254" x2="180.287" y2="139.254"/><line class="st33" x1="192.814" y1="108.425" x2="192.814" y2="117.362"/><line class="st32" x1="213.967" y1="108.425" x2="213.967" y2="117.362"/><line class="st34" x1="235.12" y1="108.425" x2="235.12" y2="117.362"/></g><g id="top-mini-stack" data-size="90x152" class="nanobox-svg ">			<use xlink:href="#mini-stack_1_"  width="87.77" height="149.102" x="-43.885" y="-74.551" transform="matrix(1 0 0 -1 43.885 74.551)" style="overflow:visible;"/></g><g id="download" data-size="12x12" class="nanobox-svg ">	<path class="st205" d="M11.49,5.641l-5.746,5.745L0,5.641h2.734V0h6.021v5.641H11.49z"/></g><g id="download-home" data-size="14x14" class="nanobox-svg ">	<path  class="arrow st206" d="M13.458,6.604l-6.729,6.729L0,6.604h3.198V0h7.054v6.604H13.458z"/></g><g id="git" data-size="27x21" class="nanobox-svg ">	<path  class="hover  st206" d="M25.956,9.809c-0.569-0.108-1.302-0.229-2.197-0.326		c-0.896-0.108-2.048-0.148-3.458-0.122c-0.096,0.163-0.143,0.312-0.143,0.448c0.229,0.014,0.56,0.021,0.979,0.051		c0.43,0.02,0.905,0.061,1.438,0.122c0.525,0.061,1.086,0.142,1.668,0.244c0.584,0.102,1.147,0.229,1.709,0.417l0.062,0.061		c-0.041,0.055-0.089,0.081-0.146,0.081c-0.543-0.162-1.104-0.295-1.688-0.396c-0.597-0.104-1.152-0.188-1.688-0.233		c-0.527-0.055-1.021-0.092-1.438-0.112c-0.43-0.02-0.748-0.021-0.969-0.021c-0.354,0.771-0.894,1.343-1.588,1.709		c-0.705,0.354-1.586,0.645-2.646,0.834c-0.139,0-0.264,0.01-0.377,0.021c-0.11,0.021-0.247,0.03-0.396,0.03		c0.225,0.149,0.479,0.309,0.777,0.479c0.311,0.17,0.604,0.354,0.891,0.6c0.279,0.229,0.521,0.506,0.729,0.824		c0.194,0.312,0.295,0.688,0.295,1.129v2.479c0,0.188,0.057,0.328,0.146,0.458c0.104,0.128,0.211,0.244,0.318,0.354		c0.115,0.102,0.229,0.188,0.312,0.264c0.1,0.075,0.14,0.146,0.123,0.193c0,0.055-0.045,0.092-0.136,0.104		c-0.095,0.021-0.188,0.03-0.312,0.03c-0.123,0-0.25-0.007-0.388-0.021c-0.145-0.021-0.265-0.025-0.364-0.038		c-0.271-0.109-0.47-0.234-0.593-0.394c-0.121-0.144-0.209-0.271-0.271-0.417c-0.055-0.146-0.066-0.312-0.062-0.479l-0.062-2.4		c-0.222-0.271-0.434-0.516-0.636-0.729c-0.182-0.189-0.354-0.362-0.539-0.521c-0.188-0.156-0.336-0.229-0.457-0.229v3.968		c0,0.203,0.056,0.386,0.146,0.549c0.104,0.163,0.217,0.306,0.336,0.428c0.121,0.122,0.229,0.23,0.336,0.325		c0.104,0.104,0.146,0.176,0.146,0.244c0,0.146-0.08,0.224-0.229,0.224c-0.153,0-0.336-0.021-0.539-0.102s-0.403-0.156-0.605-0.271		c-0.199-0.104-0.354-0.196-0.443-0.278c-0.235-0.244-0.389-0.604-0.416-1.078c-0.026-0.479-0.021-0.938,0.019-1.383		c0-0.229-0.004-0.479-0.019-0.783c-0.014-0.312-0.021-0.604-0.021-0.886c-0.021-0.354-0.025-0.688-0.041-1.021l-1.146,0.062		c0.021,0.732,0.021,1.438,0,2.096c-0.021,0.556-0.028,1.092-0.062,1.604c-0.026,0.521-0.073,0.856-0.146,1.032		c-0.104,0.23-0.271,0.423-0.483,0.57c-0.221,0.146-0.438,0.261-0.655,0.335c-0.229,0.074-0.416,0.105-0.58,0.104		c-0.162-0.017-0.24-0.062-0.24-0.184c0-0.062,0.037-0.125,0.107-0.173c0.069-0.048,0.162-0.104,0.268-0.173		c0.104-0.067,0.195-0.148,0.283-0.244c0.088-0.095,0.146-0.229,0.188-0.387c0.021-0.149,0.051-0.476,0.062-0.956		c0.014-0.488,0.021-1.005,0.021-1.546c0-0.646-0.012-1.34-0.021-2.104c-0.271,0.08-0.515,0.184-0.713,0.278		c-0.183,0.104-0.336,0.218-0.479,0.354c-0.146,0.146-0.217,0.312-0.217,0.498v2.946c0,0.188-0.062,0.354-0.177,0.521		c-0.112,0.152-0.263,0.282-0.433,0.393c-0.17,0.104-0.354,0.188-0.539,0.229c-0.188,0.062-0.354,0.082-0.483,0.082		c-0.104,0-0.229-0.01-0.362-0.021c-0.14-0.021-0.199-0.062-0.199-0.118c0-0.104,0.054-0.188,0.146-0.26		c0.104-0.065,0.213-0.152,0.334-0.254c0.123-0.102,0.229-0.203,0.336-0.322c0.104-0.116,0.146-0.271,0.146-0.44v-2.264		c-0.102,0.021-0.197,0.021-0.318,0.041c-0.104,0.02-0.229,0.021-0.377,0.021c-0.146,0.011-0.312,0.017-0.479,0.017		c-0.443,0-0.791-0.062-1.021-0.188c-0.229-0.129-0.42-0.288-0.557-0.479c-0.129-0.188-0.229-0.383-0.277-0.576		c-0.062-0.188-0.125-0.362-0.188-0.521c-0.179-0.438-0.365-0.771-0.58-0.995c-0.209-0.229-0.438-0.413-0.688-0.555		c-0.146-0.104-0.229-0.216-0.271-0.312c-0.021-0.104,0.03-0.166,0.188-0.188c0.398-0.062,0.746-0.016,1.021,0.179		c0.271,0.183,0.521,0.396,0.729,0.655c0.211,0.264,0.414,0.521,0.604,0.771c0.193,0.266,0.426,0.438,0.688,0.518		c0.396,0.104,0.709,0.146,0.939,0.146c0.23-0.019,0.477-0.104,0.697-0.284c0.021-0.163,0.125-0.312,0.336-0.469		c0.209-0.146,0.443-0.291,0.711-0.431c0.271-0.146,0.521-0.271,0.771-0.378c0.236-0.109,0.414-0.207,0.511-0.271h-0.08		c-1.312-0.104-2.364-0.386-3.149-0.834c-0.787-0.447-1.377-1.037-1.771-1.771c-0.705,0.021-1.336,0.047-1.896,0.101		c-0.562,0.047-1.062,0.104-1.511,0.173c-0.442,0.062-0.845,0.139-1.187,0.213c-0.344,0.075-0.646,0.146-0.938,0.214		c-0.041,0.041-0.096,0.064-0.146,0.071c-0.062,0.007-0.104,0.01-0.143,0.01c-0.017,0.021-0.021,0.021-0.039,0		c-0.021,0-0.041-0.021-0.041-0.081c-0.017,0-0.017-0.007,0-0.021c0-0.026,0.021-0.04,0.08-0.04c0.021,0,0.062-0.021,0.104-0.031		c0.041-0.021,0.068-0.03,0.104-0.03c0.604-0.146,1.315-0.309,2.184-0.478c0.854-0.17,1.968-0.271,3.336-0.295		c-0.039-0.082-0.075-0.16-0.104-0.234c-0.032-0.074-0.069-0.146-0.11-0.214c-0.261,0-0.64,0.011-1.146,0.029		C3.961,9.401,3.44,9.429,2.89,9.458C2.336,9.479,1.815,9.53,1.304,9.595C0.789,9.65,0.401,9.717,0.116,9.799		c-0.06,0-0.08-0.021-0.08-0.041c-0.021-0.021-0.021-0.034,0-0.062C0.015,9.675,0.005,9.649,0.015,9.635		C0.03,9.614,0.036,9.601,0.036,9.573c0.28-0.062,0.682-0.128,1.186-0.183c0.502-0.06,1.021-0.104,1.57-0.133		c0.555-0.033,1.072-0.062,1.574-0.081c0.502-0.021,0.896-0.03,1.188-0.03c-0.146-0.354-0.239-0.749-0.28-1.188		C5.233,7.52,5.212,7.062,5.212,6.604c0-0.42,0.026-0.783,0.095-1.089c0.062-0.312,0.146-0.579,0.241-0.823		C5.649,4.448,5.777,4.22,5.91,4.01C6.053,3.8,6.216,3.572,6.389,3.349C6.266,2.861,6.201,2.411,6.211,2.005		s0.043-0.771,0.105-1.062C6.378,0.59,6.48,0.287,6.596,0.027C6.825,0.013,7.111,0.048,7.43,0.131		c0.271,0.062,0.607,0.188,1.021,0.377c0.414,0.183,0.896,0.471,1.455,0.854c0.303-0.104,0.694-0.217,1.196-0.271		c0.502-0.067,1.024-0.108,1.586-0.122c0.562-0.021,1.104,0.004,1.646,0.052c0.543,0.047,0.998,0.118,1.357,0.213		c0.223-0.135,0.479-0.284,0.793-0.445c0.312-0.149,0.618-0.311,0.932-0.438c0.311-0.129,0.598-0.229,0.856-0.295		c0.271-0.067,0.487-0.074,0.647-0.021c0.057,0.081,0.104,0.193,0.176,0.337c0.062,0.146,0.109,0.345,0.146,0.579		c0.041,0.244,0.062,0.542,0.062,0.896s-0.03,0.767-0.104,1.236c0.057,0.104,0.146,0.236,0.311,0.421		c0.146,0.171,0.308,0.396,0.472,0.683c0.162,0.287,0.312,0.641,0.438,1.067c0.129,0.428,0.188,0.938,0.188,1.557		c-0.021,0.477-0.062,0.905-0.104,1.292c-0.041,0.387-0.102,0.735-0.162,1.048c1.396,0,2.531,0.044,3.418,0.132		c0.884,0.089,1.617,0.188,2.222,0.295l0.039,0.041c0.022,0.027,0.041,0.062,0.041,0.081c-0.041,0-0.062,0.021-0.08,0.062		C26.004,9.792,25.984,9.809,25.956,9.809z"/></g><g id="irc" data-size="21x21" class="nanobox-svg ">	<polygon class="st26" points="20.196,0 0,0 0,14.416 10.917,14.416 16.831,20.33 16.831,14.416 20.196,14.416 	"/></g><g id="git-big" data-size="41x32" class="nanobox-svg ">	<path class="st26" d="M40.621,15.274c-0.89-0.169-2.021-0.339-3.434-0.509c-1.398-0.169-3.2-0.232-5.405-0.191		c-0.146,0.271-0.223,0.488-0.223,0.7c0.36,0.021,0.875,0.047,1.543,0.08c0.667,0.032,1.414,0.095,2.24,0.19		c0.827,0.096,1.694,0.223,2.604,0.382c0.911,0.159,1.804,0.376,2.671,0.651l0.098,0.096c-0.062,0.085-0.141,0.127-0.226,0.127		c-0.848-0.254-1.729-0.461-2.653-0.62c-0.923-0.159-1.803-0.28-2.64-0.365c-0.838-0.084-1.59-0.143-2.258-0.175		c-0.667-0.032-1.171-0.048-1.511-0.048c-0.562,1.208-1.379,2.099-2.479,2.671s-2.479,1.007-4.133,1.303		c-0.212,0-0.408,0.021-0.588,0.062c-0.181,0.021-0.388,0.048-0.619,0.048c0.338,0.229,0.746,0.479,1.226,0.747		c0.479,0.266,0.938,0.562,1.396,0.938c0.438,0.36,0.812,0.79,1.128,1.287c0.312,0.499,0.461,1.086,0.461,1.771v3.883		c0,0.271,0.08,0.515,0.229,0.716c0.154,0.2,0.323,0.381,0.519,0.541c0.181,0.159,0.345,0.296,0.481,0.413		c0.146,0.111,0.213,0.217,0.188,0.302c0,0.084-0.069,0.146-0.207,0.179c-0.14,0.028-0.302,0.05-0.492,0.05		c-0.188,0-0.394-0.018-0.604-0.026c-0.211-0.021-0.402-0.043-0.571-0.062c-0.425-0.173-0.729-0.363-0.923-0.595		c-0.189-0.223-0.328-0.438-0.412-0.646c-0.086-0.229-0.117-0.482-0.104-0.768l-0.096-3.755c-0.339-0.424-0.668-0.808-0.979-1.146		c-0.272-0.3-0.562-0.563-0.854-0.812c-0.28-0.239-0.521-0.36-0.715-0.36v6.194c0,0.316,0.072,0.604,0.232,0.856		c0.152,0.254,0.334,0.479,0.521,0.666c0.187,0.188,0.363,0.354,0.521,0.51c0.152,0.146,0.23,0.271,0.23,0.381		c0,0.229-0.121,0.354-0.361,0.354s-0.521-0.056-0.846-0.155c-0.312-0.104-0.646-0.241-0.955-0.412		c-0.312-0.173-0.556-0.312-0.695-0.438c-0.385-0.384-0.604-0.939-0.646-1.688c-0.06-0.735-0.054-1.464,0.021-2.159		c0-0.342-0.008-0.741-0.021-1.229c-0.017-0.479-0.021-0.938-0.054-1.386c-0.021-0.527-0.043-1.062-0.062-1.594l-1.772,0.102		c0.021,1.166,0.021,2.26,0,3.271c-0.021,0.867-0.06,1.706-0.103,2.517c-0.043,0.81-0.113,1.351-0.229,1.622		c-0.17,0.354-0.427,0.651-0.767,0.895c-0.342,0.229-0.688,0.405-1.031,0.521c-0.354,0.11-0.646,0.169-0.898,0.153		c-0.254-0.017-0.388-0.104-0.388-0.271c0-0.104,0.062-0.19,0.183-0.271c0.108-0.068,0.254-0.164,0.412-0.271		c0.153-0.104,0.312-0.229,0.438-0.384c0.146-0.146,0.235-0.354,0.309-0.604c0.041-0.229,0.068-0.729,0.1-1.493		c0.021-0.769,0.028-1.563,0.028-2.416c0-0.997-0.019-2.089-0.028-3.271c-0.429,0.127-0.795,0.271-1.111,0.438		c-0.271,0.146-0.521,0.334-0.746,0.562c-0.229,0.229-0.334,0.479-0.334,0.774v4.605c0,0.298-0.094,0.562-0.271,0.812		c-0.188,0.238-0.398,0.439-0.668,0.604c-0.271,0.154-0.545,0.271-0.847,0.356c-0.303,0.088-0.557,0.129-0.771,0.129		c-0.17,0-0.354-0.019-0.568-0.025c-0.211-0.021-0.312-0.086-0.312-0.188c0-0.146,0.076-0.277,0.232-0.396		c0.156-0.116,0.334-0.25,0.521-0.396c0.188-0.146,0.361-0.312,0.521-0.515c0.155-0.188,0.235-0.425,0.235-0.694v-3.525		c-0.146,0.021-0.312,0.043-0.51,0.062c-0.17,0.021-0.365,0.032-0.594,0.05c-0.227,0.013-0.477,0.021-0.746,0.021		c-0.695,0-1.229-0.104-1.604-0.308C9.473,24.5,9.188,24.252,8.99,23.955c-0.196-0.3-0.354-0.604-0.44-0.903		c-0.101-0.312-0.188-0.574-0.306-0.812c-0.271-0.686-0.573-1.194-0.9-1.562c-0.33-0.354-0.688-0.646-1.062-0.854		c-0.229-0.169-0.371-0.334-0.412-0.491c-0.043-0.156,0.054-0.262,0.278-0.305c0.645-0.104,1.166-0.021,1.597,0.271		c0.425,0.284,0.802,0.634,1.129,1.03c0.321,0.396,0.646,0.812,0.948,1.207c0.312,0.396,0.662,0.668,1.062,0.795		c0.611,0.171,1.104,0.241,1.479,0.229c0.366-0.021,0.729-0.169,1.102-0.438c0.021-0.254,0.189-0.497,0.521-0.729		c0.324-0.229,0.695-0.455,1.104-0.669c0.414-0.214,0.812-0.406,1.188-0.591c0.385-0.184,0.646-0.318,0.795-0.434h-0.127		c-2.062-0.175-3.695-0.604-4.933-1.309c-1.229-0.7-2.146-1.622-2.771-2.771c-1.104,0.021-2.088,0.062-2.957,0.146		c-0.867,0.073-1.649,0.164-2.354,0.271c-0.694,0.104-1.312,0.222-1.849,0.334c-0.526,0.107-1.021,0.229-1.463,0.334		c-0.062,0.062-0.146,0.104-0.233,0.104c-0.096,0.009-0.164,0.021-0.207,0.021c-0.021,0.021-0.043,0.021-0.062,0		c-0.043,0-0.062-0.042-0.062-0.128c-0.021,0-0.021-0.02,0-0.027c0-0.041,0.043-0.062,0.127-0.062c0.043,0,0.1-0.02,0.155-0.049		c0.062-0.024,0.112-0.049,0.155-0.049c0.938-0.229,2.062-0.479,3.396-0.747s3.067-0.418,5.222-0.461		c-0.062-0.128-0.123-0.249-0.183-0.364c-0.058-0.11-0.104-0.229-0.181-0.334c-0.396,0-0.996,0.021-1.771,0.052		c-0.781,0.026-1.604,0.069-2.472,0.128c-0.854,0.061-1.688,0.122-2.479,0.206c-0.795,0.087-1.414,0.188-1.854,0.312		c-0.084,0-0.127-0.021-0.127-0.062c-0.021-0.021-0.021-0.061,0-0.104C0,15.098-0.014,15.07,0.016,15.043		c0.021-0.021,0.027-0.062,0.027-0.104c0.441-0.104,1.062-0.192,1.848-0.279c0.781-0.084,1.604-0.148,2.466-0.205		c0.854-0.062,1.688-0.104,2.47-0.127c0.78-0.028,1.396-0.056,1.846-0.056c-0.229-0.554-0.383-1.173-0.44-1.854		c-0.062-0.688-0.099-1.396-0.099-2.113c0-0.648,0.052-1.225,0.146-1.698c0.104-0.479,0.229-0.896,0.386-1.284		C8.821,6.935,9.02,6.594,9.233,6.261C9.462,5.933,9.712,5.589,9.981,5.23C9.793,4.465,9.705,3.767,9.71,3.13		c0.012-0.644,0.065-1.188,0.176-1.65c0.104-0.554,0.254-1.021,0.443-1.434c0.354-0.021,0.795,0.026,1.305,0.157		c0.432,0.104,0.959,0.304,1.604,0.59c0.646,0.279,1.396,0.729,2.271,1.353c0.474-0.188,1.099-0.341,1.877-0.438		c0.782-0.104,1.604-0.17,2.479-0.188c0.862-0.021,1.729,0.008,2.569,0.079c0.854,0.075,1.562,0.188,2.129,0.333		c0.345-0.211,0.754-0.44,1.238-0.697c0.481-0.255,0.973-0.479,1.44-0.686c0.479-0.201,0.931-0.354,1.354-0.462		c0.429-0.104,0.771-0.115,1.021-0.031c0.084,0.128,0.177,0.304,0.271,0.521c0.104,0.228,0.182,0.521,0.234,0.898		c0.062,0.388,0.1,0.854,0.1,1.397c0,0.552-0.057,1.188-0.152,1.938c0.084,0.172,0.236,0.396,0.479,0.647		c0.229,0.27,0.479,0.619,0.729,1.062c0.257,0.441,0.479,1.002,0.688,1.672c0.198,0.671,0.309,1.479,0.309,2.438		c-0.043,0.741-0.104,1.415-0.154,2.021c-0.062,0.604-0.146,1.146-0.26,1.646c2.188,0,3.969,0.062,5.346,0.206		c1.377,0.139,2.529,0.292,3.468,0.461l0.062,0.062c0.043,0.045,0.062,0.088,0.062,0.133c-0.062,0-0.104,0.021-0.129,0.074		C40.694,15.248,40.664,15.274,40.621,15.274z"/></g><g id="irc-big" data-size="32x32" class="nanobox-svg ">	<polygon class="st26" points="31.56,0 0,0 0,22.53 17.059,22.53 26.3,31.771 26.3,22.53 31.56,22.53 	"/></g><g id="trello" data-size="31x26" class="nanobox-svg ">	<path class="st26" d="M14.231,18.264c-0.321,0-0.616-0.062-0.883-0.188s-0.519-0.294-0.756-0.504l-4.451-4.479		c-0.226-0.224-0.394-0.479-0.504-0.767c-0.113-0.286-0.169-0.577-0.169-0.871s0.056-0.581,0.169-0.861		c0.111-0.275,0.279-0.521,0.504-0.729C8.364,9.636,8.62,9.469,8.908,9.344c0.287-0.118,0.577-0.178,0.871-0.178		c0.295,0,0.582,0.06,0.86,0.178c0.28,0.12,0.532,0.291,0.757,0.521l2.836,2.835L26.253,0.671c0.223-0.223,0.479-0.391,0.756-0.503		C27.288,0.056,27.579,0,27.88,0c0.307,0,0.598,0.056,0.871,0.168c0.28,0.112,0.532,0.28,0.762,0.503		c0.229,0.225,0.396,0.477,0.488,0.757c0.104,0.28,0.157,0.57,0.157,0.871s-0.062,0.592-0.157,0.872s-0.271,0.532-0.488,0.756		L15.867,17.573c-0.211,0.21-0.452,0.378-0.729,0.504C14.85,18.202,14.552,18.264,14.231,18.264z"/><polygon class="st26" points="25.559,25.889 0,25.889 0,0.331 21.987,0.331 19.011,3.331 3,3.331 3,22.889 22.559,22.889 		22.559,15.223 25.559,11.867 	"/></g><g id="mac" data-size="115x133" class="nanobox-svg ">	<polygon class="st206" points="0,33.091 57.314,0 114.63,33.091 114.63,99.273 57.314,132.363 0,99.273 	"/><g  class="logo" >		<path class="st207" d="M60.52,43.814c3.127-4.12,7.475-4.141,7.475-4.141s0.646,3.875-2.459,7.608			c-3.312,3.982-7.084,3.33-7.084,3.33S57.743,47.478,60.52,43.814z"/><path class="st207" d="M58.846,53.326c1.611,0,4.604-2.21,8.479-2.21c6.69,0,9.315,4.757,9.315,4.757s-5.146,2.631-5.146,9.013			c0,7.202,6.408,9.685,6.408,9.685s-4.479,12.61-10.529,12.61c-2.781,0-4.943-1.873-7.873-1.873c-2.979,0-5.943,1.943-7.873,1.943			c-5.531,0-12.512-11.962-12.512-21.58c0-9.459,5.906-14.424,11.455-14.424C54.179,51.247,56.974,53.326,58.846,53.326z"/></g></g><g id="win" data-size="115x132" class="nanobox-svg ">	<polygon class="st206" points="0,32.966 57.102,0 114.199,32.966 114.199,98.899 57.102,131.865 0,98.899 	"/><g  class="logo " >		<polygon class="st207" points="77.667,64.789 77.667,42.007 51.498,45.824 51.498,64.789 		"/><polygon class="st207" points="49.652,46.093 30.649,48.866 30.649,64.789 49.652,64.789 		"/><polygon class="st207" points="30.649,66.635 30.649,82.759 49.652,85.565 49.652,66.635 		"/><polygon class="st207" points="51.498,85.837 77.667,89.697 77.667,66.635 51.498,66.635 		"/></g></g><g id="lnx" data-size="115x132" class="nanobox-svg ">	<polygon class="st206" points="0,32.966 57.101,0 114.2,32.966 114.2,98.899 57.101,131.865 0,98.899 	"/><g  class="logo " >		<path class="st207" d="M50.739,81.053c1.899-0.197,2.153-2.212,1.256-3.093c-0.739-0.724-4.812-3.748-5.876-4.939			c-0.494-0.552-1.165-0.822-1.445-1.442c-0.646-1.426-1.104-3.465-0.271-4.928c0.146-0.264,0.237-0.146,0.132,0.405			c-0.646,3.121,1.387,5.67,1.828,4.363c0.312-0.903,0.021-2.52,0.188-3.802c0.295-2.271,2.361-6.633,3.271-6.881			c-1.396-2.594,1.64-4.624,1.604-6.903c-0.021-1.478,1.308,1.821,2.627,2.523c1.489,0.78,3.123-1.473,5.441-2.616			c0.655-0.325,1.499-0.698,1.438-0.973c-0.271-1.332-3.045,1.643-5.521,1.741c-1.132,0.047-1.548-0.222-1.988-0.643			c-1.312-1.275,0.145-0.212,2.104-0.566c0.871-0.159,1.167-0.304,2.091-0.677c0.927-0.375,1.986-0.93,3.033-1.214			c0.729-0.197,0.667-0.747,0.386-0.912c-0.163-0.095-0.406-0.085-0.604,0.245c-0.442,0.778-2.562,1.227-3.229,1.431			c-0.847,0.256-1.787,0.5-3.03,0.449c-1.894-0.079-1.443-0.943-2.804-1.718c-0.396-0.229-0.291-0.825,0.235-1.354			c0.275-0.275,1.031-0.431,1.408-1.062c0.056-0.086,0.537-0.593,0.916-0.855c0.134-0.089,0.146-2.399-1.045-2.447			c-1.004-0.04-1.289,0.74-1.252,1.517c0.043,0.777,0.455,1.42,0.729,1.414c0.527-0.003,0.035,0.581-0.258,0.675			c-0.438,0.142-1.042-1.729-0.972-2.632c0.062-0.936,0.562-2.597,1.735-2.564c1.065,0.03,1.854,1.368,1.812,3.679			c-0.011,0.392,1.729-0.188,2.312,0.426c0.414,0.439-1.42-4.094,2.67-4.406c1.073,0.208,2.11,0.565,2.541,3.043			c-0.154,0.257,0.271,1.986-0.396,2.191c-0.813,0.248-1.315-0.036-0.854-0.81c0.321-0.776,0.014-2.751-1.637-2.632			c-1.646,0.118-1.428,3.034-0.979,3.09c0.447,0.057,1.584,0.864,2.377,1.016c2.604,0.506,0.688,1.996,1.021,3.799			c0.386,2.039,1.729,1.498,2.935,6.892c0.254,0.329,1.252,0.641,2.227,4.783c0.879,3.729-0.363,6.438,1.74,6.216			c0.479-0.05,1.166-0.183,1.471-1.239c0.787-2.76-0.396-6.05-1.59-8.271c-0.69-1.294-1.354-2.177-1.695-2.478			c1.367,0.807,3.113,3.39,3.521,5.307c0.528,2.517,0.905,3.584,0.104,6.246c0.463,0.233,1.621,0.721,1.621,1.271			c-1.205-0.986-4.877-1.162-4.971,1.197c-0.635,0.012-1.104,0.064-1.504,0.542c-1.479,1.754-0.104,5.271-0.262,7.159			c-0.139,1.658-0.598,3.305-0.854,4.973c-0.879-0.033-0.791-0.677-0.513-1.58c0.248-0.796,0.646-1.793,0.681-2.75			c0.021-0.864-0.071-1.407-0.289-1.541c-0.225-0.136-0.562,0.137-1.029,0.898c-1.014,1.625-3.193,2.337-5.234,2.592			c-2.039,0.257-3.938,0.054-4.938-1.07c-0.351-0.385-0.914,0.103-0.979,0.208c-0.096,0.135,0.33,0.401,0.646,0.985			c0.468,0.854,0.909,2.151-0.193,2.741C52.663,83.066,51.711,82.89,50.739,81.053L50.739,81.053z M50.006,80.973			c0.734,1.15,3.312,5.993-1.207,6.624c-1.509,0.209-3.938-0.878-6.291-1.454c-2.107-0.521-4.271-0.826-5.472-1.164			c-0.722-0.202-1.028-0.463-1.091-0.766c-0.165-0.803,0.884-1.931,0.934-2.883c0.062-0.954-0.352-1.448-0.676-2.224			c-0.328-0.78-0.412-1.36-0.152-1.696c0.205-0.26,0.621-0.367,1.312-0.302c0.854,0.084,1.886-0.09,2.438-0.429			c0.938-0.572,1.373-1.742,0.948-3.152c0,1.382-0.446,1.901-1.586,2.533c-1.062,0.596-2.715,0.115-3.476,0.771			c-0.912,0.792,0.318,2.835,0.224,4.335c-0.073,1.154-1.28,2.455-0.746,3.609c0.542,1.163,3.062,1.288,5.688,1.837			c3.726,0.78,5.896,2.14,7.629,2.203c2.513,0.093,2.896-2.487,6.846-2.521c1.152-0.062,2.277-0.098,3.402-0.113			c1.271-0.014,2.545-0.003,3.854,0.026c2.627,0.065,1.729,1.438,3.432,2.312c1.438,0.739,4.021,0.448,4.646-0.142			c0.836-0.798,3.083-2.719,4.812-3.585c2.146-1.083,7.188-2.945,3.521-5.213c-0.854-0.53-2.868-1.091-3.039-4.962			c-0.762,0.682-0.67,4.288,1.457,5.004c2.378,0.799,3.865,2.135-0.557,3.648c-2.938,1.001-3.438,1.31-5.746,3.239			c-2.354,1.953-5.827,1.178-5.229-2.933c0.314-2.142,0.5-3.912-0.026-5.775c-0.267-0.909-0.396-2.077-0.213-2.894			c0.354-1.591,1.207-2.07,2.054-0.544c0.525,0.958,0.718,2.081,2.606,2.172c2.979,0.143,3.564-2.881,4.521-3.018			c0.635-0.093,1.271-1.891,0.787-4.8c-0.521-3.115-2.354-8.031-4.699-10.524c-1.955-2.074-3.188-3.89-3.959-6.484			c-0.646-2.179-1.015-4.3-0.882-6.326c0.179-2.63-1.278-6.286-3.604-8.006c-1.449-1.077-3.729-1.653-5.791-1.63			c-1.152,0.014-2.24,0.182-3.082,0.633c-3.438,1.867-3.918,4.535-3.865,7.582c0.053,2.856,0.146,6.124,0.477,9.228			c-0.386,1.426-2.386,4.126-3.675,5.77c-1.728,1.706-2.595,4.996-3.705,7.871c-0.6,1.534-1.604,2.226-1.688,4.196			c-0.021,0.551-0.01,1.979,0.521,1.57C43.674,71.041,46.195,74.972,50.006,80.973L50.006,80.973z M60.474,39.749			c-0.105,0.324-0.555,0.596-0.271,0.822c0.287,0.23,0.448-0.315,1.022-0.521c0.143-0.051,0.83,0.023,0.959-0.306			c0.053-0.139-0.354-0.302-0.604-0.536c-0.238-0.233-0.479-0.44-0.71-0.427C60.282,38.82,60.57,39.461,60.474,39.749L60.474,39.749			z M63.98,51.609c0.214-0.225,0.32,0.385,0.896,0.747c0.453,0.285,0.896,0.072,1.011,0.655c0.077,0.416-0.181,0.867-0.521,0.809			C64.752,53.715,63.349,52.269,63.98,51.609L63.98,51.609z M54.522,47.949c-0.943-0.07-1.007,0.609-0.694,0.601			C54.141,48.537,53.948,48.01,54.522,47.949L54.522,47.949z M52.902,46.207c0.112-0.024,0.271,0.165,0.221,0.433			c-0.062,0.369-0.035,0.599,0.221,0.602c0.039,0,0.088-0.01,0.104-0.104c0.122-0.736-0.26-1.279-0.412-1.316			C52.668,45.728,52.715,46.248,52.902,46.207L52.902,46.207z M59.769,45.895c0.238,0.07,0.469,0.485,0.519,0.934			c0.007,0.041,0.316-0.065,0.318-0.162c0.021-0.721-0.599-1.06-0.759-1.045C59.478,45.655,59.583,45.841,59.769,45.895			L59.769,45.895z M56.25,48.035c0.856-0.396,1.157,0.22,0.861,0.318C56.81,48.456,56.804,47.893,56.25,48.035L56.25,48.035z			 M45.888,62.649c-0.404-0.048,0.107-0.353,0.343-0.736c0.243-0.423,0.194-0.947,0.45-0.87c0.261,0.076,0.105,0.372-0.062,0.854			C46.472,62.31,46.044,62.667,45.888,62.649L45.888,62.649z"/></g></g><g id="download-breakdown" data-size="388x320" class="nanobox-svg ">	<g  class="ubuntu" >		<rect y="64.47" class="st208" width="281.021" height="198.608"/><rect x="195.916" y="70.243" class="st209" width="79.321" height="7.135"/><rect x="6.088" y="70.243" class="st209" width="185.662" height="186.688"/><g>			<g>				<polyline class="st210" points="387.555,0.5 215.801,0.5 157.311,58.989 				"/><g>					<path class="st211" d="M154.75,61.55c0.758-1.652,1.489-3.909,1.604-5.644l1.288,2.748l2.747,1.277						C158.659,60.06,156.401,60.792,154.75,61.55z"/></g>			</g>		</g>		<g>			<g>				<polyline class="st210" points="387.555,121.779 354.639,121.779 307.518,74.657 289.443,74.657 				"/><g>					<path class="st211" d="M285.821,74.657c1.705-0.643,3.812-1.711,5.129-2.854l-1.032,2.854l1.032,2.853						C289.641,76.368,287.527,75.289,285.821,74.657z"/></g>			</g>		</g>		<g  class="vagrant" >			<polyline class="st210" points="387.555,228.819 378.824,228.819 300.209,150.207 289.539,150.207 			"/><g>				<path class="st211" d="M285.918,150.207c1.704-0.632,3.818-1.711,5.129-2.854l-1.033,2.854l1.033,2.853					C289.735,151.918,287.622,150.839,285.918,150.207z"/></g>			<rect x="195.916" y="81.993" class="st209" width="79.321" height="84.812"/></g>		<g  class="virtual-box" >			<polyline class="st210" points="387.555,318.955 302.651,318.955 253.422,269.726 			"/><g>				<path class="st211" d="M250.86,267.165c1.646,0.758,3.899,1.49,5.645,1.604l-2.747,1.288l-1.287,2.747					C252.352,271.074,251.619,268.817,250.86,267.165z"/></g>			<rect x="195.916" y="172.114" class="st209" width="79.321" height="84.812"/></g>	</g></g><g id="checkbox" data-size="18x16" class="nanobox-svg ">	<rect class="st212" width="15.739" height="15.741"/><g  class="check" >		<path class="st16" d="M9.046,11.505c-0.252,0-0.483-0.05-0.692-0.148c-0.211-0.1-0.408-0.232-0.597-0.397L4.249,7.437			C4.061,7.26,3.937,7.059,3.853,6.833C3.765,6.606,3.719,6.378,3.719,6.145c0-0.232,0.045-0.458,0.134-0.679			c0.088-0.221,0.221-0.413,0.396-0.579c0.176-0.176,0.377-0.312,0.604-0.405s0.455-0.141,0.688-0.141s0.457,0.047,0.688,0.141			c0.221,0.094,0.42,0.229,0.596,0.405L9.054,7.12L14.7,1.463c0.181-0.177,0.373-0.309,0.602-0.397			c0.225-0.088,0.442-0.132,0.688-0.132c0.23,0,0.47,0.044,0.688,0.132c0.229,0.089,0.418,0.221,0.603,0.397			c0.181,0.177,0.312,0.375,0.392,0.596c0.084,0.221,0.125,0.449,0.125,0.687s-0.041,0.466-0.125,0.687			c-0.082,0.221-0.211,0.419-0.392,0.595l-6.938,6.932c-0.166,0.165-0.354,0.298-0.566,0.397			C9.536,11.455,9.301,11.505,9.046,11.505z"/></g></g><g id="download-big" data-size="16x16" class="nanobox-svg ">	<path class="st206" d="M3.782,7.789V0h8.311v7.789h3.777l-7.932,7.932L0,7.789H3.782z"/></g><g id="mad-scientist-window" data-size="236x231" class="nanobox-svg ">	<circle class="st183" cx="120.47" cy="115.351" r="114.851"/><g>		<defs>			<circle id="SVGID_117_" cx="120.47" cy="115.351" r="114.851"/></defs>		<clipPath id="SVGID_118_">			<use xlink:href="#SVGID_117_"  style="overflow:visible;"/></clipPath>		<g class="st213">			<path class="st32" d="M60.568,80.346C26.186,92.834,1.12,139.716,1.12,181.753L1,199.574"/><path class="st32" d="M141.818,116.265c-4.197-6.367-9.214-10.035-12.265-8.519c-0.938,0.465-1.603,1.37-2.003,2.604"/><path class="st32" d="M140.017,139.544c2.225,1.614,4.311,2.198,5.882,1.441c2.476-1.238,3.056-5.534,1.87-10.945"/><path class="st32" d="M61.989,117.752"/><line class="st32" x1="129.271" y1="107.877" x2="179.712" y2="79.123"/><line class="st32" x1="176.177" y1="124.584" x2="194.385" y2="199.943"/><path class="st32" d="M126.276,127.916c-0.205,0.258-0.398,0.531-0.579,0.818c-1.794,2.867-2.192,7.052,0.228,9.958"/><path class="st32" d="M118.303,145.009c-5.484-6.623-5.249-16.797,0.557-23.667l0.366-0.379l13.01-9.214"/><path class="st32" d="M122.118,141.849c-2.84-3.414-3.435-7.962-2.276-12.007"/><path class="st32" d="M130.857,151.797c-0.245-0.579-0.355-1.188-0.288-1.845c0.086-0.88,0.439-1.671,1.036-2.218				c1.036-0.935,3.969-3.261,3.969-3.261"/><path class="st33" d="M87.91,201.251c-1.674,0-2.974-1.139-1.49-3.441c2.581-3.969,11.278-21.158,12.108-22.242				c1.399-1.815,1.38-3.083,0.228-3.083c-1.143,0,0,0-2.298,0c-2.294,0-2.061-3.21,0-3.21c1.905,0,13.526,0,15.596,0				s2.299,3.21,0,3.21c-2.294,0-1.142,0-2.294,0c-1.144,0-0.612,1.81,0.228,3.083c0.756,1.151,9.533,18.275,12.114,22.242				c1.491,2.3,0.181,3.441-1.491,3.441C118.211,201.251,90.322,201.251,87.91,201.251z"/><line class="st34" x1="95.836" y1="188.405" x2="91.524" y2="196.594"/><line class="st34" x1="100.98" y1="186.37" x2="95.595" y2="196.594"/><line class="st34" x1="104.095" y1="188.17" x2="99.658" y2="196.594"/><line class="st34" x1="109.111" y1="186.37" x2="103.728" y2="196.594"/><line class="st34" x1="112.12" y1="188.389" x2="107.796" y2="196.594"/><line class="st34" x1="114.441" y1="191.706" x2="111.865" y2="196.594"/><line class="st34" x1="116.987" y1="194.609" x2="115.933" y2="196.594"/><path class="st33" d="M108.631,146.439c-0.061,0.935,0.666,1.775,1.617,1.844c0.558,0.025,1.07-0.197,1.412-0.587l2.529-2.199"/><path class="st34" d="M103.422,165.061c1.171-4.512,3.209-8.695,5.991-12.37"/><path class="st34" d="M107.257,166.056c1.542-5.969,5.586-12.884,10.023-16.911l4.368-3.69"/><path class="st32" d="M66.055,199.567l-9.125-56.866c-21.839,4.853-25.074,56.866-25.074,56.866"/><line class="st32" x1="151.255" y1="190.9" x2="175.136" y2="183.947"/><line class="st32" x1="152.274" y1="175.331" x2="154.783" y2="185.677"/><line class="st32" x1="155.585" y1="174.243" x2="158.093" y2="184.592"/><polyline class="st32" points="165.873,176.438 166.057,177.196 167.347,182.517 			"/><path class="st32" d="M123.944,69.352c1.534-0.075,70.819-7.185,79.168-7.185c9.649,0,17.475,7.709,17.475,17.245				c0,5.517-2.627,10.439-6.711,13.588l-67.444,47.634"/><path class="st33" d="M118.78,157.281c-0.952,0.112-1.81-0.581-1.919-1.519c-0.066-0.554,0.142-1.086,0.511-1.441l0.004,0.002				l34.895-31.486c0.842-0.801,1.372-1.932,1.372-3.187c0-2.424-1.967-4.391-4.393-4.391c-1.022,0-1.957,0.348-2.703,0.935				l-19.061,17.264"/><path class="st32" d="M88.22,77.315"/><line class="st34" x1="89.232" y1="145.009" x2="97.928" y2="161.132"/><line class="st34" x1="92.62" y1="165.061" x2="85.846" y2="157.293"/><line class="st34" x1="89.357" y1="168.987" x2="77.348" y2="163.522"/><line class="st34" x1="88.143" y1="173.914" x2="80.07" y2="173.914"/><path class="st35" d="M69.862,43.878c0.487,6.389,10.074,11.797,21.162,10.002c4.928-0.784,7.439-3.108,13.898-3.635"/><path class="st35" d="M73.457,39.686c3.612,3.557,10.885,6.842,18.664,5.03"/><path class="st36" d="M83.265,80.744"/><path class="st32" d="M101.113,69.222c2.74,0,4.96,2.22,4.96,4.96c0,2.754-2.22,4.96-4.96,4.96s-4.96-2.206-4.96-4.96				C96.154,71.443,98.375,69.222,101.113,69.222z"/><path class="st32" d="M78.292,72.729c2.741,0,4.96,2.203,4.96,4.96c0,2.74-2.219,4.96-4.96,4.96c-2.74,0-4.96-2.22-4.96-4.96				C73.333,74.949,75.556,72.729,78.292,72.729z"/><path class="st35" d="M108.993,90.865c0,2.265,1.835,4.1,4.097,4.1c2.263,0,4.1-1.835,4.1-4.1"/><path class="st32" d="M73.914,93.362c-2.263,0-4.097-1.845-4.097-4.097v-8.163"/><path class="st35" d="M108.19,95.908c-2.263,0-4.1,1.837-4.1,4.1c0,2.253,1.837,4.097,4.1,4.097"/><path class="st35" d="M109.258,108.363c2.263,0,4.097-1.837,4.097-4.1c0-2.249-1.835-4.097-4.097-4.097"/><path class="st35" d="M104.838,113.339c-2.264,0-4.099,1.844-4.099,4.107c0,2.253,1.835,4.097,4.099,4.097"/><path class="st35" d="M89.275,112.118c-2.263,0-4.099,1.844-4.099,4.1c0,2.263,1.836,4.097,4.099,4.097"/><path class="st35" d="M97.901,120.489c0,2.263-1.836,4.097-4.099,4.097"/><path class="st35" d="M80.186,114.038c2.263,0,4.097-1.845,4.097-4.097"/><path class="st35" d="M73.47,101.341c2.263,0,4.106-1.845,4.106-4.114c0-2.249-1.841-4.1-4.106-4.1"/><path class="st35" d="M77.701,104.875c0,2.263,1.837,4.112,4.1,4.112"/><path class="st35" d="M92.317,113.975c-2.263,0-4.1-1.837-4.1-4.1v-4.374"/><path class="st35" d="M91.962,118.46c2.265,0,4.1-1.844,4.1-4.097v-6.957"/><path class="st35" d="M96.876,111.261c2.263,0,4.1-1.845,4.1-4.097v-6.951"/><path class="st35" d="M108.185,117.541c-2.263,0-4.097-1.845-4.097-4.107v-6.951"/><line class="st32" x1="87.716" y1="100.604" x2="98.333" y2="98.978"/><path class="st35" d="M82.989,102.706l-0.504-4.37c-0.26-2.249,1.348-4.272,3.601-4.526l3.852-0.445"/><path class="st35" d="M101.013,100.796l-0.278-4.373c-0.147-2.249-2.098-3.969-4.361-3.817l-3.868,0.254"/><path class="st32" d="M106.138,72.729c4.413,0,11.241-4.12,11.241-16.022"/><path class="st32" d="M83.252,77.689c0,0,5.471-6.142,12.9-2.704"/><path class="st32" d="M73.333,77.689c-5.643-0.43-5.991-3.464-5.991-6.901c0-5.119-1.464-9.681-1.464-13.235				c0-14.219,11.529-25.745,25.755-25.745c14.22,0,25.749,11.526,25.749,25.745c0,2.834-0.039,5.952-0.19,9.194				c0,0,0,20.318,0,24.114"/><path class="st32" d="M109.959,38.85"/><path class="st36" d="M97.94,73.601c0.075-1.059,0.995-1.845,2.054-1.773"/><path class="st36" d="M74.773,77.161c0.083-1.059,1.005-1.845,2.061-1.77"/><path class="st35" d="M79.738,34.541c5.334,4.702,11.201,0.835,17.871,4.858"/></g>	</g></g><g id="right-arrow" data-size="7x9" class="nanobox-svg ">	<polygon class="st26" points="6.711,4.062 0,8.126 0,0 	"/></g><g id="irc-outline" data-size="34x35" class="nanobox-svg ">	<polygon class="st33" points="32.553,1 1,1 1,24.495 17.43,24.495 27.065,34.13 27.065,24.495 32.553,24.495 	"/></g><g id="plugin-scripts" data-size="377x211" class="nanobox-svg ">	<path class="st214" d="M139.934,24.398l-12.125-6.837l-3.805,2.341V15.5L96.502,0.006l-22.104,13.59V17.9l-3.652-2.059		l-15.979,9.825l5.438,3.062v24.884l-5.438,3.35l9.097,5.125l-0.021,0.014l-9.071-5.139v6.471l3.604,2.03l-3.604,2.216v5.468		l43.431,24.472l8.908-5.479v-3.627l3.076,1.735l29.754-18.293V61.57l-3.127-1.764l3.127-1.923L139.934,24.398L139.934,24.398z		 M115.333,53.544L115.333,53.544l3.732-2.297v0.001L115.333,53.544z M98.354,73.401l20.712-12.729v0.001L98.358,73.402		L98.354,73.401z"/><g class="st50">		<path class="st52" d="M5.312,201.381c-0.063,0.117-0.162,0.176-0.295,0.176c-0.08,0-0.172-0.029-0.272-0.088			c-0.102-0.059-0.226-0.124-0.372-0.196s-0.322-0.139-0.523-0.2c-0.203-0.062-0.443-0.092-0.721-0.092			c-0.24,0-0.456,0.03-0.648,0.092c-0.191,0.062-0.355,0.146-0.492,0.252c-0.135,0.107-0.239,0.231-0.312,0.372			c-0.071,0.142-0.108,0.295-0.108,0.46c0,0.208,0.061,0.382,0.181,0.521s0.278,0.259,0.476,0.359			c0.197,0.102,0.422,0.191,0.672,0.269c0.251,0.077,0.508,0.16,0.772,0.248s0.521,0.186,0.772,0.292			c0.25,0.106,0.475,0.239,0.672,0.399s0.355,0.356,0.476,0.588c0.12,0.232,0.181,0.511,0.181,0.836			c0,0.374-0.067,0.719-0.201,1.036c-0.133,0.317-0.33,0.593-0.592,0.824c-0.262,0.232-0.581,0.415-0.959,0.548			c-0.379,0.134-0.816,0.2-1.312,0.2c-0.565,0-1.078-0.092-1.536-0.276c-0.459-0.184-0.849-0.42-1.168-0.708l0.336-0.544			c0.042-0.069,0.093-0.122,0.151-0.159c0.059-0.038,0.137-0.057,0.232-0.057s0.197,0.037,0.305,0.112			c0.105,0.074,0.235,0.157,0.388,0.248c0.151,0.091,0.336,0.173,0.552,0.248c0.216,0.074,0.486,0.111,0.812,0.111			c0.277,0,0.52-0.035,0.728-0.107s0.382-0.169,0.521-0.292s0.24-0.264,0.308-0.424c0.066-0.16,0.101-0.331,0.101-0.513			c0-0.224-0.061-0.409-0.181-0.556s-0.278-0.271-0.476-0.376c-0.197-0.104-0.424-0.194-0.676-0.271			c-0.254-0.078-0.513-0.159-0.777-0.244c-0.264-0.086-0.521-0.183-0.775-0.292s-0.479-0.247-0.676-0.412s-0.355-0.369-0.477-0.612			c-0.119-0.242-0.18-0.537-0.18-0.884c0-0.31,0.064-0.606,0.191-0.893c0.129-0.285,0.315-0.535,0.561-0.752			c0.246-0.216,0.547-0.388,0.904-0.516s0.766-0.192,1.224-0.192c0.534,0,1.013,0.084,1.437,0.252			c0.424,0.169,0.791,0.399,1.1,0.692L5.312,201.381z"/><path class="st52" d="M7.616,208.149v-8.104h0.848c0.203,0,0.33,0.099,0.384,0.296l0.112,0.88c0.352-0.39,0.745-0.704,1.18-0.944			s0.938-0.36,1.508-0.36c0.443,0,0.834,0.074,1.172,0.221c0.339,0.146,0.621,0.354,0.849,0.624c0.227,0.27,0.398,0.593,0.516,0.972			s0.177,0.798,0.177,1.256v5.16h-1.425v-5.16c0-0.613-0.14-1.089-0.42-1.428s-0.708-0.508-1.284-0.508			c-0.421,0-0.814,0.102-1.18,0.304c-0.365,0.203-0.703,0.478-1.012,0.824v5.968H7.616z"/><path class="st52" d="M18.415,197.5c0,0.14-0.027,0.269-0.084,0.389c-0.055,0.12-0.13,0.227-0.223,0.319			c-0.094,0.094-0.202,0.167-0.324,0.221c-0.123,0.053-0.254,0.08-0.393,0.08s-0.268-0.027-0.388-0.08			c-0.12-0.054-0.228-0.127-0.32-0.221c-0.093-0.093-0.167-0.199-0.22-0.319c-0.054-0.12-0.08-0.249-0.08-0.389			c0-0.139,0.026-0.271,0.08-0.396c0.053-0.125,0.127-0.234,0.22-0.328c0.093-0.093,0.2-0.167,0.32-0.22			c0.12-0.054,0.249-0.08,0.388-0.08s0.27,0.026,0.393,0.08c0.122,0.053,0.23,0.127,0.324,0.22c0.093,0.094,0.168,0.203,0.223,0.328			C18.388,197.23,18.415,197.362,18.415,197.5z M18.096,200.045v8.104h-1.424v-8.104H18.096z"/><path class="st52" d="M20.927,208.149v-6.888l-0.896-0.104c-0.112-0.026-0.204-0.067-0.276-0.124			c-0.071-0.056-0.107-0.137-0.107-0.244v-0.584h1.279v-0.783c0-0.465,0.066-0.876,0.197-1.236c0.13-0.36,0.316-0.664,0.56-0.912			s0.534-0.436,0.876-0.564c0.342-0.128,0.725-0.191,1.152-0.191c0.362,0,0.698,0.053,1.008,0.16l-0.032,0.712			c-0.005,0.106-0.051,0.171-0.136,0.191c-0.086,0.021-0.205,0.032-0.36,0.032h-0.248c-0.245,0-0.468,0.032-0.668,0.096			c-0.2,0.064-0.372,0.168-0.517,0.312c-0.144,0.144-0.254,0.333-0.332,0.568c-0.076,0.234-0.115,0.525-0.115,0.871v0.744h2.344			v1.032h-2.296v6.912H20.927z"/><path class="st52" d="M26.319,208.149v-6.888l-0.896-0.104c-0.111-0.026-0.203-0.067-0.275-0.124			c-0.072-0.056-0.107-0.137-0.107-0.244v-0.584h1.279v-0.783c0-0.465,0.065-0.876,0.196-1.236c0.13-0.36,0.317-0.664,0.56-0.912			c0.243-0.248,0.535-0.436,0.877-0.564c0.341-0.128,0.725-0.191,1.151-0.191c0.362,0,0.698,0.053,1.008,0.16l-0.032,0.712			c-0.005,0.106-0.051,0.171-0.136,0.191c-0.085,0.021-0.205,0.032-0.36,0.032h-0.248c-0.244,0-0.467,0.032-0.668,0.096			c-0.199,0.064-0.371,0.168-0.516,0.312c-0.145,0.144-0.254,0.333-0.332,0.568c-0.077,0.234-0.115,0.525-0.115,0.871v0.744h2.344			v1.032h-2.297v6.912H26.319z"/></g>	<g class="st50">		<path class="st52" d="M74.561,208.149v-11.784h1.433v4.849c0.336-0.39,0.721-0.703,1.156-0.94			c0.434-0.237,0.932-0.356,1.491-0.356c0.47,0,0.894,0.089,1.272,0.265s0.701,0.438,0.968,0.788			c0.267,0.349,0.472,0.781,0.616,1.296c0.144,0.515,0.216,1.107,0.216,1.78c0,0.597-0.08,1.153-0.24,1.668s-0.391,0.96-0.692,1.336			c-0.301,0.376-0.669,0.672-1.104,0.888s-0.924,0.324-1.469,0.324c-0.521,0-0.966-0.102-1.331-0.305			c-0.366-0.202-0.685-0.485-0.956-0.848l-0.072,0.736c-0.043,0.202-0.165,0.304-0.367,0.304H74.561z M78.177,201.053			c-0.464,0-0.871,0.106-1.221,0.319c-0.349,0.214-0.67,0.515-0.963,0.904v3.92c0.256,0.353,0.539,0.601,0.852,0.744			s0.66,0.216,1.044,0.216c0.757,0,1.339-0.27,1.744-0.808c0.405-0.539,0.608-1.307,0.608-2.304c0-0.528-0.047-0.981-0.141-1.36			s-0.229-0.689-0.404-0.933c-0.176-0.242-0.392-0.42-0.647-0.531C78.793,201.109,78.502,201.053,78.177,201.053z"/><path class="st52" d="M86.737,199.916c0.592,0,1.126,0.1,1.604,0.297c0.477,0.197,0.883,0.477,1.216,0.84			c0.333,0.362,0.589,0.801,0.769,1.315c0.178,0.515,0.268,1.09,0.268,1.725c0,0.64-0.09,1.216-0.268,1.728			c-0.18,0.512-0.436,0.949-0.769,1.312c-0.333,0.362-0.739,0.641-1.216,0.836c-0.478,0.194-1.012,0.292-1.604,0.292			c-0.593,0-1.127-0.098-1.604-0.292c-0.478-0.195-0.884-0.474-1.22-0.836c-0.336-0.363-0.596-0.801-0.776-1.312			c-0.182-0.512-0.272-1.088-0.272-1.728c0-0.635,0.091-1.21,0.272-1.725c0.181-0.515,0.44-0.953,0.776-1.315			c0.336-0.363,0.742-0.643,1.22-0.84S86.145,199.916,86.737,199.916z M86.737,207.149c0.799,0,1.396-0.268,1.791-0.804			s0.592-1.284,0.592-2.244c0-0.966-0.197-1.718-0.592-2.256c-0.395-0.539-0.992-0.809-1.791-0.809			c-0.406,0-0.758,0.069-1.057,0.208s-0.548,0.339-0.748,0.601c-0.2,0.261-0.35,0.582-0.448,0.964			c-0.099,0.381-0.147,0.812-0.147,1.292c0,0.479,0.049,0.909,0.147,1.288s0.248,0.697,0.448,0.956s0.449,0.457,0.748,0.596			S86.331,207.149,86.737,207.149z"/><path class="st52" d="M93.769,203.996l-2.729-3.951h1.369c0.117,0,0.202,0.019,0.256,0.056c0.053,0.037,0.101,0.091,0.144,0.16			l1.983,3.04c0.049-0.149,0.117-0.299,0.209-0.448l1.744-2.561c0.053-0.074,0.105-0.134,0.16-0.18			c0.053-0.045,0.119-0.067,0.199-0.067h1.312l-2.729,3.871l2.84,4.232h-1.367c-0.117,0-0.21-0.03-0.276-0.092			c-0.067-0.062-0.122-0.13-0.164-0.204l-2.04-3.176c-0.037,0.154-0.094,0.293-0.168,0.416l-1.889,2.76			c-0.053,0.074-0.11,0.143-0.172,0.204c-0.061,0.062-0.145,0.092-0.252,0.092h-1.271L93.769,203.996z"/><path class="st52" d="M100.257,208.149v-6.888l-0.896-0.104c-0.111-0.026-0.203-0.067-0.275-0.124			c-0.072-0.056-0.108-0.137-0.108-0.244v-0.584h1.28v-0.447c0-0.496,0.077-0.951,0.232-1.364c0.154-0.413,0.386-0.77,0.695-1.068			c0.309-0.299,0.695-0.53,1.156-0.695c0.461-0.166,0.998-0.248,1.611-0.248c0.203,0,0.41,0.014,0.621,0.041			c0.21,0.027,0.393,0.068,0.547,0.123l-0.047,0.743c-0.012,0.068-0.043,0.111-0.097,0.129c-0.054,0.019-0.131,0.027-0.231,0.027			c-0.059,0-0.121,0-0.185,0s-0.136,0-0.216,0c-0.944,0-1.631,0.195-2.061,0.587c-0.43,0.391-0.644,0.979-0.644,1.767v0.406h4.896			v7.944h-1.424v-6.912h-3.424v6.912H100.257z"/><path class="st52" d="M110.641,196.364v11.784h-1.424v-11.784H110.641z"/><path class="st52" d="M116.36,199.916c0.485,0,0.934,0.082,1.344,0.244c0.411,0.163,0.766,0.397,1.064,0.704			s0.531,0.686,0.699,1.136c0.168,0.451,0.252,0.965,0.252,1.54c0,0.225-0.023,0.374-0.071,0.448			c-0.048,0.075-0.139,0.112-0.272,0.112h-5.392c0.011,0.512,0.08,0.957,0.208,1.336s0.305,0.694,0.527,0.948			c0.225,0.253,0.491,0.442,0.801,0.567c0.309,0.126,0.656,0.188,1.04,0.188c0.356,0,0.665-0.041,0.924-0.124			s0.481-0.172,0.668-0.269c0.187-0.096,0.343-0.185,0.468-0.268s0.233-0.124,0.324-0.124c0.117,0,0.208,0.045,0.271,0.136			l0.4,0.521c-0.176,0.213-0.387,0.398-0.632,0.556s-0.508,0.287-0.788,0.388c-0.279,0.102-0.569,0.178-0.867,0.229			c-0.299,0.051-0.596,0.076-0.889,0.076c-0.561,0-1.076-0.095-1.548-0.284s-0.88-0.467-1.224-0.832			c-0.345-0.365-0.613-0.817-0.805-1.356c-0.191-0.538-0.288-1.157-0.288-1.855c0-0.565,0.087-1.094,0.261-1.584			c0.173-0.491,0.422-0.916,0.748-1.276c0.324-0.359,0.723-0.643,1.191-0.848S115.773,199.916,116.36,199.916z M116.393,200.965			c-0.688,0-1.229,0.198-1.624,0.596s-0.641,0.948-0.736,1.652h4.408c0-0.331-0.045-0.634-0.137-0.908			c-0.09-0.274-0.223-0.513-0.399-0.712c-0.176-0.2-0.391-0.354-0.644-0.464C117.007,201.02,116.718,200.965,116.393,200.965z"/></g>	<g class="st50">		<path class="st52" d="M151.285,210.893v-10.848h0.849c0.202,0,0.33,0.099,0.383,0.296l0.121,0.96			c0.346-0.422,0.742-0.761,1.188-1.017s0.959-0.384,1.54-0.384c0.464,0,0.886,0.09,1.265,0.268c0.378,0.18,0.701,0.443,0.967,0.792			c0.268,0.35,0.473,0.783,0.617,1.301c0.144,0.517,0.215,1.111,0.215,1.784c0,0.597-0.08,1.153-0.24,1.668			c-0.159,0.515-0.389,0.96-0.688,1.336s-0.665,0.672-1.1,0.888c-0.436,0.216-0.924,0.324-1.469,0.324			c-0.501,0-0.929-0.083-1.283-0.248c-0.355-0.165-0.668-0.4-0.94-0.704v3.584H151.285z M154.894,201.053			c-0.465,0-0.871,0.106-1.221,0.319c-0.35,0.214-0.67,0.515-0.964,0.904v3.92c0.261,0.353,0.548,0.601,0.86,0.744			s0.66,0.216,1.044,0.216c0.752,0,1.331-0.27,1.735-0.808c0.406-0.539,0.608-1.307,0.608-2.304c0-0.528-0.046-0.981-0.14-1.36			s-0.229-0.689-0.404-0.933c-0.176-0.242-0.393-0.42-0.648-0.531C155.509,201.109,155.218,201.053,154.894,201.053z"/><path class="st52" d="M160.117,208.149v-8.104h0.815c0.155,0,0.262,0.029,0.32,0.088s0.1,0.159,0.12,0.304l0.097,1.264			c0.277-0.565,0.619-1.007,1.027-1.324c0.408-0.316,0.887-0.476,1.436-0.476c0.225,0,0.428,0.025,0.608,0.076			c0.182,0.051,0.35,0.121,0.505,0.212l-0.185,1.063c-0.038,0.134-0.12,0.2-0.248,0.2c-0.075,0-0.189-0.025-0.345-0.076			c-0.154-0.05-0.37-0.075-0.647-0.075c-0.496,0-0.911,0.144-1.243,0.432c-0.334,0.288-0.613,0.707-0.837,1.256v5.16H160.117z"/><path class="st52" d="M169.772,199.916c0.486,0,0.934,0.082,1.345,0.244c0.411,0.163,0.765,0.397,1.063,0.704			s0.532,0.686,0.7,1.136c0.168,0.451,0.252,0.965,0.252,1.54c0,0.225-0.024,0.374-0.071,0.448			c-0.049,0.075-0.139,0.112-0.272,0.112h-5.392c0.01,0.512,0.08,0.957,0.207,1.336c0.129,0.379,0.305,0.694,0.528,0.948			c0.224,0.253,0.491,0.442,0.8,0.567c0.31,0.126,0.656,0.188,1.041,0.188c0.356,0,0.664-0.041,0.924-0.124			c0.258-0.083,0.48-0.172,0.668-0.269c0.186-0.096,0.342-0.185,0.468-0.268c0.125-0.083,0.233-0.124,0.323-0.124			c0.117,0,0.209,0.045,0.272,0.136l0.399,0.521c-0.176,0.213-0.387,0.398-0.631,0.556c-0.246,0.157-0.508,0.287-0.789,0.388			c-0.279,0.102-0.568,0.178-0.867,0.229s-0.596,0.076-0.889,0.076c-0.56,0-1.076-0.095-1.547-0.284			c-0.473-0.189-0.881-0.467-1.225-0.832s-0.612-0.817-0.805-1.356c-0.191-0.538-0.287-1.157-0.287-1.855			c0-0.565,0.086-1.094,0.26-1.584c0.174-0.491,0.422-0.916,0.748-1.276c0.325-0.359,0.723-0.643,1.191-0.848			C168.658,200.02,169.187,199.916,169.772,199.916z M169.806,200.965c-0.688,0-1.23,0.198-1.625,0.596s-0.64,0.948-0.736,1.652			h4.408c0-0.331-0.045-0.634-0.136-0.908s-0.224-0.513-0.399-0.712c-0.176-0.2-0.391-0.354-0.645-0.464			S170.13,200.965,169.806,200.965z"/><path class="st52" d="M174.948,210.893v-10.848h0.849c0.202,0,0.331,0.099,0.384,0.296l0.12,0.96			c0.347-0.422,0.743-0.761,1.188-1.017s0.958-0.384,1.539-0.384c0.465,0,0.886,0.09,1.265,0.268			c0.378,0.18,0.701,0.443,0.968,0.792c0.267,0.35,0.473,0.783,0.616,1.301c0.144,0.517,0.216,1.111,0.216,1.784			c0,0.597-0.08,1.153-0.24,1.668s-0.389,0.96-0.688,1.336s-0.666,0.672-1.1,0.888c-0.436,0.216-0.925,0.324-1.469,0.324			c-0.502,0-0.93-0.083-1.283-0.248c-0.355-0.165-0.669-0.4-0.941-0.704v3.584H174.948z M178.557,201.053			c-0.464,0-0.87,0.106-1.22,0.319c-0.35,0.214-0.671,0.515-0.965,0.904v3.92c0.262,0.353,0.549,0.601,0.861,0.744			c0.312,0.144,0.659,0.216,1.043,0.216c0.752,0,1.331-0.27,1.736-0.808c0.405-0.539,0.607-1.307,0.607-2.304			c0-0.528-0.046-0.981-0.139-1.36c-0.094-0.379-0.229-0.689-0.404-0.933c-0.176-0.242-0.393-0.42-0.648-0.531			C179.173,201.109,178.882,201.053,178.557,201.053z"/><path class="st52" d="M189.732,208.149h-0.632c-0.139,0-0.251-0.021-0.336-0.064c-0.086-0.042-0.142-0.133-0.168-0.271			l-0.16-0.752c-0.213,0.191-0.422,0.364-0.624,0.516c-0.203,0.152-0.416,0.28-0.64,0.384c-0.225,0.104-0.463,0.184-0.717,0.236			c-0.253,0.054-0.535,0.08-0.844,0.08c-0.314,0-0.609-0.044-0.884-0.132c-0.274-0.089-0.514-0.222-0.716-0.397			c-0.203-0.177-0.364-0.4-0.484-0.671s-0.18-0.59-0.18-0.959c0-0.321,0.088-0.63,0.264-0.928c0.176-0.297,0.46-0.561,0.852-0.79			c0.393-0.23,0.906-0.419,1.541-0.566c0.635-0.146,1.41-0.221,2.328-0.221v-0.636c0-0.634-0.135-1.112-0.404-1.437			c-0.27-0.325-0.668-0.487-1.196-0.487c-0.347,0-0.639,0.044-0.876,0.132s-0.443,0.187-0.616,0.296s-0.323,0.208-0.448,0.296			s-0.249,0.132-0.371,0.132c-0.097,0-0.181-0.025-0.252-0.076c-0.072-0.05-0.13-0.113-0.173-0.188l-0.256-0.456			c0.448-0.432,0.931-0.755,1.448-0.968c0.518-0.214,1.09-0.32,1.72-0.32c0.453,0,0.856,0.075,1.208,0.224			c0.352,0.149,0.648,0.357,0.889,0.624c0.239,0.268,0.421,0.59,0.543,0.969c0.123,0.378,0.185,0.794,0.185,1.248V208.149z			 M186.036,207.277c0.251,0,0.48-0.025,0.688-0.076c0.209-0.051,0.404-0.122,0.589-0.216c0.184-0.093,0.36-0.207,0.528-0.34			c0.168-0.134,0.332-0.285,0.492-0.456v-1.672c-0.656,0-1.214,0.041-1.673,0.125c-0.458,0.083-0.832,0.191-1.12,0.325			c-0.287,0.135-0.497,0.293-0.628,0.475c-0.13,0.183-0.196,0.387-0.196,0.612c0,0.214,0.035,0.399,0.104,0.555			c0.069,0.156,0.163,0.283,0.28,0.383c0.117,0.099,0.256,0.171,0.416,0.217S185.85,207.277,186.036,207.277z"/><path class="st52" d="M191.893,208.149v-8.104h0.815c0.155,0,0.262,0.029,0.32,0.088s0.1,0.159,0.12,0.304l0.097,1.264			c0.277-0.565,0.619-1.007,1.027-1.324c0.408-0.316,0.887-0.476,1.436-0.476c0.225,0,0.428,0.025,0.608,0.076			c0.182,0.051,0.35,0.121,0.505,0.212l-0.185,1.063c-0.038,0.134-0.12,0.2-0.248,0.2c-0.075,0-0.189-0.025-0.345-0.076			c-0.154-0.05-0.37-0.075-0.647-0.075c-0.496,0-0.911,0.144-1.243,0.432c-0.334,0.288-0.613,0.707-0.837,1.256v5.16H191.893z"/><path class="st52" d="M201.548,199.916c0.486,0,0.934,0.082,1.345,0.244c0.411,0.163,0.765,0.397,1.063,0.704			s0.532,0.686,0.7,1.136c0.168,0.451,0.252,0.965,0.252,1.54c0,0.225-0.024,0.374-0.071,0.448			c-0.049,0.075-0.139,0.112-0.272,0.112h-5.392c0.01,0.512,0.08,0.957,0.207,1.336c0.129,0.379,0.305,0.694,0.528,0.948			c0.224,0.253,0.491,0.442,0.8,0.567c0.31,0.126,0.656,0.188,1.041,0.188c0.356,0,0.664-0.041,0.924-0.124			c0.258-0.083,0.48-0.172,0.668-0.269c0.186-0.096,0.342-0.185,0.468-0.268c0.125-0.083,0.233-0.124,0.323-0.124			c0.117,0,0.209,0.045,0.272,0.136l0.399,0.521c-0.176,0.213-0.387,0.398-0.631,0.556c-0.246,0.157-0.508,0.287-0.789,0.388			c-0.279,0.102-0.568,0.178-0.867,0.229s-0.596,0.076-0.889,0.076c-0.56,0-1.076-0.095-1.547-0.284			c-0.473-0.189-0.881-0.467-1.225-0.832s-0.612-0.817-0.805-1.356c-0.191-0.538-0.287-1.157-0.287-1.855			c0-0.565,0.086-1.094,0.26-1.584c0.174-0.491,0.422-0.916,0.748-1.276c0.325-0.359,0.723-0.643,1.191-0.848			C200.434,200.02,200.962,199.916,201.548,199.916z M201.581,200.965c-0.688,0-1.23,0.198-1.625,0.596s-0.64,0.948-0.736,1.652			h4.408c0-0.331-0.045-0.634-0.136-0.908s-0.224-0.513-0.399-0.712c-0.176-0.2-0.391-0.354-0.645-0.464			S201.905,200.965,201.581,200.965z"/></g>	<g class="st50">		<path class="st52" d="M242.305,208.149v-11.784h1.433v4.849c0.336-0.39,0.721-0.703,1.156-0.94			c0.434-0.237,0.932-0.356,1.491-0.356c0.47,0,0.894,0.089,1.272,0.265s0.701,0.438,0.968,0.788			c0.267,0.349,0.472,0.781,0.616,1.296c0.144,0.515,0.216,1.107,0.216,1.78c0,0.597-0.08,1.153-0.24,1.668s-0.391,0.96-0.692,1.336			c-0.301,0.376-0.669,0.672-1.104,0.888s-0.924,0.324-1.469,0.324c-0.521,0-0.966-0.102-1.331-0.305			c-0.366-0.202-0.685-0.485-0.956-0.848l-0.072,0.736c-0.043,0.202-0.165,0.304-0.367,0.304H242.305z M245.921,201.053			c-0.464,0-0.871,0.106-1.221,0.319c-0.349,0.214-0.67,0.515-0.963,0.904v3.92c0.256,0.353,0.539,0.601,0.852,0.744			s0.66,0.216,1.044,0.216c0.757,0,1.339-0.27,1.744-0.808c0.405-0.539,0.608-1.307,0.608-2.304c0-0.528-0.047-0.981-0.141-1.36			s-0.229-0.689-0.404-0.933c-0.176-0.242-0.392-0.42-0.647-0.531C246.537,201.109,246.246,201.053,245.921,201.053z"/><path class="st52" d="M252.433,200.045v5.168c0,0.613,0.141,1.088,0.424,1.424s0.709,0.504,1.28,0.504			c0.416,0,0.808-0.099,1.176-0.296s0.707-0.473,1.017-0.824v-5.976h1.424v8.104h-0.848c-0.203,0-0.332-0.099-0.385-0.296			l-0.111-0.872c-0.353,0.39-0.747,0.703-1.185,0.94c-0.438,0.236-0.938,0.355-1.504,0.355c-0.442,0-0.833-0.073-1.172-0.22			s-0.623-0.354-0.853-0.62c-0.229-0.267-0.4-0.589-0.516-0.968s-0.172-0.798-0.172-1.256v-5.168H252.433z"/><path class="st52" d="M262.001,197.5c0,0.14-0.028,0.269-0.084,0.389c-0.057,0.12-0.131,0.227-0.225,0.319			c-0.094,0.094-0.201,0.167-0.324,0.221c-0.122,0.053-0.253,0.08-0.392,0.08s-0.269-0.027-0.388-0.08			c-0.12-0.054-0.227-0.127-0.32-0.221c-0.094-0.093-0.166-0.199-0.22-0.319s-0.08-0.249-0.08-0.389c0-0.139,0.026-0.271,0.08-0.396			s0.126-0.234,0.22-0.328c0.094-0.093,0.2-0.167,0.32-0.22c0.119-0.054,0.249-0.08,0.388-0.08s0.27,0.026,0.392,0.08			c0.123,0.053,0.23,0.127,0.324,0.22c0.094,0.094,0.168,0.203,0.225,0.328C261.973,197.23,262.001,197.362,262.001,197.5z			 M261.681,200.045v8.104h-1.424v-8.104H261.681z"/><path class="st52" d="M265.776,196.364v11.784h-1.424v-11.784H265.776z"/><path class="st52" d="M273.993,208.149c-0.203,0-0.332-0.099-0.385-0.296l-0.128-0.984c-0.347,0.422-0.743,0.759-1.188,1.013			c-0.445,0.253-0.955,0.38-1.531,0.38c-0.465,0-0.886-0.09-1.264-0.269c-0.379-0.179-0.701-0.441-0.969-0.788			c-0.267-0.347-0.472-0.778-0.615-1.296c-0.145-0.517-0.217-1.111-0.217-1.784c0-0.597,0.08-1.153,0.24-1.668			s0.391-0.961,0.691-1.34c0.302-0.378,0.668-0.676,1.101-0.892s0.923-0.324,1.472-0.324c0.496,0,0.92,0.084,1.272,0.252			s0.667,0.404,0.944,0.708v-4.496h1.424v11.784H273.993z M271.232,207.109c0.464,0,0.87-0.106,1.22-0.32			c0.35-0.213,0.671-0.515,0.965-0.903v-3.92c-0.262-0.353-0.549-0.599-0.86-0.74s-0.657-0.212-1.036-0.212			c-0.758,0-1.339,0.27-1.744,0.808c-0.405,0.539-0.607,1.307-0.607,2.304c0,0.528,0.045,0.98,0.136,1.356s0.224,0.686,0.399,0.928			c0.176,0.243,0.393,0.42,0.648,0.532S270.901,207.109,271.232,207.109z"/></g>	<g class="st50">		<path class="st52" d="M328.677,201.485c-0.042,0.059-0.084,0.104-0.127,0.136c-0.043,0.032-0.104,0.048-0.185,0.048			c-0.079,0-0.167-0.033-0.26-0.1s-0.212-0.14-0.356-0.22c-0.144-0.08-0.318-0.153-0.523-0.22c-0.205-0.067-0.457-0.101-0.756-0.101			c-0.395,0-0.744,0.071-1.049,0.212c-0.303,0.142-0.559,0.346-0.764,0.612s-0.359,0.589-0.464,0.968s-0.155,0.803-0.155,1.272			c0,0.49,0.055,0.927,0.168,1.308c0.111,0.382,0.269,0.701,0.471,0.96c0.203,0.259,0.449,0.456,0.74,0.592			c0.291,0.137,0.617,0.204,0.98,0.204c0.347,0,0.632-0.041,0.855-0.124c0.225-0.082,0.411-0.175,0.561-0.275			c0.149-0.102,0.271-0.193,0.368-0.276c0.096-0.083,0.192-0.124,0.288-0.124c0.123,0,0.213,0.045,0.271,0.136l0.4,0.521			c-0.352,0.432-0.792,0.748-1.32,0.947c-0.527,0.2-1.086,0.301-1.672,0.301c-0.507,0-0.978-0.094-1.412-0.28			s-0.812-0.457-1.132-0.812c-0.319-0.354-0.572-0.79-0.756-1.308c-0.185-0.518-0.276-1.106-0.276-1.768			c0-0.603,0.084-1.16,0.252-1.672c0.168-0.513,0.414-0.954,0.736-1.324c0.322-0.371,0.721-0.66,1.195-0.868s1.02-0.312,1.633-0.312			c0.564,0,1.066,0.093,1.504,0.276s0.824,0.444,1.16,0.78L328.677,201.485z"/><path class="st52" d="M332.205,196.364v11.784h-1.424v-11.784H332.205z"/><path class="st52" d="M337.925,199.916c0.486,0,0.934,0.082,1.345,0.244c0.411,0.163,0.765,0.397,1.063,0.704			s0.532,0.686,0.7,1.136c0.168,0.451,0.252,0.965,0.252,1.54c0,0.225-0.024,0.374-0.071,0.448			c-0.049,0.075-0.139,0.112-0.272,0.112h-5.392c0.01,0.512,0.08,0.957,0.207,1.336c0.129,0.379,0.305,0.694,0.528,0.948			c0.224,0.253,0.491,0.442,0.8,0.567c0.31,0.126,0.656,0.188,1.041,0.188c0.356,0,0.664-0.041,0.924-0.124			c0.258-0.083,0.48-0.172,0.668-0.269c0.186-0.096,0.342-0.185,0.468-0.268c0.125-0.083,0.233-0.124,0.323-0.124			c0.117,0,0.209,0.045,0.272,0.136l0.399,0.521c-0.176,0.213-0.387,0.398-0.631,0.556c-0.246,0.157-0.508,0.287-0.789,0.388			c-0.279,0.102-0.568,0.178-0.867,0.229s-0.596,0.076-0.889,0.076c-0.56,0-1.076-0.095-1.547-0.284			c-0.473-0.189-0.881-0.467-1.225-0.832s-0.612-0.817-0.805-1.356c-0.191-0.538-0.287-1.157-0.287-1.855			c0-0.565,0.086-1.094,0.26-1.584c0.174-0.491,0.422-0.916,0.748-1.276c0.325-0.359,0.723-0.643,1.191-0.848			C336.811,200.02,337.339,199.916,337.925,199.916z M337.958,200.965c-0.688,0-1.23,0.198-1.625,0.596s-0.64,0.948-0.736,1.652			h4.408c0-0.331-0.045-0.634-0.136-0.908s-0.224-0.513-0.399-0.712c-0.176-0.2-0.391-0.354-0.645-0.464			S338.282,200.965,337.958,200.965z"/><path class="st52" d="M349.054,208.149h-0.633c-0.139,0-0.25-0.021-0.336-0.064c-0.086-0.042-0.141-0.133-0.168-0.271l-0.16-0.752			c-0.213,0.191-0.421,0.364-0.623,0.516c-0.203,0.152-0.416,0.28-0.641,0.384c-0.225,0.104-0.463,0.184-0.716,0.236			c-0.253,0.054-0.535,0.08-0.845,0.08c-0.314,0-0.609-0.044-0.883-0.132c-0.275-0.089-0.514-0.222-0.717-0.397			c-0.203-0.177-0.363-0.4-0.484-0.671c-0.119-0.271-0.18-0.59-0.18-0.959c0-0.321,0.088-0.63,0.264-0.928			c0.176-0.297,0.461-0.561,0.853-0.79c0.392-0.23,0.905-0.419,1.54-0.566c0.635-0.146,1.41-0.221,2.328-0.221v-0.636			c0-0.634-0.135-1.112-0.404-1.437c-0.27-0.325-0.668-0.487-1.195-0.487c-0.348,0-0.639,0.044-0.877,0.132			c-0.236,0.088-0.442,0.187-0.615,0.296c-0.174,0.109-0.323,0.208-0.448,0.296c-0.126,0.088-0.249,0.132-0.372,0.132			c-0.096,0-0.18-0.025-0.252-0.076c-0.072-0.05-0.129-0.113-0.172-0.188l-0.256-0.456c0.447-0.432,0.93-0.755,1.447-0.968			c0.518-0.214,1.091-0.32,1.721-0.32c0.453,0,0.855,0.075,1.207,0.224c0.353,0.149,0.648,0.357,0.889,0.624			c0.24,0.268,0.422,0.59,0.544,0.969c0.122,0.378,0.185,0.794,0.185,1.248V208.149z M345.356,207.277			c0.252,0,0.48-0.025,0.688-0.076s0.404-0.122,0.589-0.216c0.184-0.093,0.359-0.207,0.527-0.34			c0.168-0.134,0.332-0.285,0.492-0.456v-1.672c-0.656,0-1.213,0.041-1.672,0.125c-0.459,0.083-0.832,0.191-1.12,0.325			c-0.288,0.135-0.497,0.293-0.628,0.475c-0.131,0.183-0.196,0.387-0.196,0.612c0,0.214,0.034,0.399,0.104,0.555			c0.068,0.156,0.162,0.283,0.279,0.383c0.117,0.099,0.256,0.171,0.416,0.217S345.171,207.277,345.356,207.277z"/><path class="st52" d="M351.213,208.149v-8.104h0.849c0.202,0,0.33,0.099,0.383,0.296l0.113,0.88			c0.352-0.39,0.744-0.704,1.18-0.944c0.434-0.24,0.938-0.36,1.508-0.36c0.442,0,0.833,0.074,1.172,0.221			c0.338,0.146,0.621,0.354,0.848,0.624s0.398,0.593,0.516,0.972s0.177,0.798,0.177,1.256v5.16h-1.425v-5.16			c0-0.613-0.139-1.089-0.42-1.428c-0.279-0.339-0.707-0.508-1.283-0.508c-0.422,0-0.814,0.102-1.18,0.304			c-0.365,0.203-0.703,0.478-1.013,0.824v5.968H351.213z"/><path class="st52" d="M361.341,200.045v5.168c0,0.613,0.141,1.088,0.424,1.424s0.709,0.504,1.28,0.504			c0.416,0,0.808-0.099,1.176-0.296s0.707-0.473,1.017-0.824v-5.976h1.424v8.104h-0.848c-0.203,0-0.332-0.099-0.385-0.296			l-0.111-0.872c-0.353,0.39-0.747,0.703-1.185,0.94c-0.438,0.236-0.938,0.355-1.504,0.355c-0.442,0-0.833-0.073-1.172-0.22			s-0.623-0.354-0.853-0.62c-0.229-0.267-0.4-0.589-0.516-0.968s-0.172-0.798-0.172-1.256v-5.168H361.341z"/><path class="st52" d="M369.005,210.893v-10.848h0.848c0.203,0,0.331,0.099,0.385,0.296l0.119,0.96			c0.348-0.422,0.743-0.761,1.188-1.017s0.958-0.384,1.54-0.384c0.464,0,0.885,0.09,1.264,0.268c0.379,0.18,0.701,0.443,0.969,0.792			c0.266,0.35,0.472,0.783,0.615,1.301c0.145,0.517,0.217,1.111,0.217,1.784c0,0.597-0.08,1.153-0.24,1.668s-0.39,0.96-0.688,1.336			c-0.298,0.376-0.665,0.672-1.1,0.888s-0.925,0.324-1.468,0.324c-0.502,0-0.93-0.083-1.284-0.248s-0.669-0.4-0.94-0.704v3.584			H369.005z M372.612,201.053c-0.463,0-0.87,0.106-1.219,0.319c-0.35,0.214-0.672,0.515-0.965,0.904v3.92			c0.262,0.353,0.549,0.601,0.86,0.744s0.659,0.216,1.044,0.216c0.752,0,1.33-0.27,1.736-0.808c0.404-0.539,0.607-1.307,0.607-2.304			c0-0.528-0.047-0.981-0.14-1.36c-0.094-0.379-0.228-0.689-0.404-0.933c-0.176-0.242-0.392-0.42-0.647-0.531			C373.229,201.109,372.938,201.053,372.612,201.053z"/></g>	<rect x="0.708" y="137.842" class="st215" width="31.397" height="42.718"/><line class="st216" x1="7.406" y1="147.699" x2="24.78" y2="147.699"/><line class="st216" x1="7.406" y1="152.5" x2="21.406" y2="152.5"/><line class="st216" x1="7.406" y1="162.102" x2="21.406" y2="162.102"/><line class="st216" x1="7.406" y1="157.301" x2="24.78" y2="157.301"/><rect x="81.448" y="137.842" class="st215" width="31.397" height="42.718"/><line class="st216" x1="88.146" y1="147.699" x2="105.521" y2="147.699"/><line class="st216" x1="88.146" y1="152.5" x2="102.146" y2="152.5"/><line class="st216" x1="88.146" y1="162.102" x2="102.146" y2="162.102"/><line class="st216" x1="88.146" y1="157.301" x2="105.521" y2="157.301"/><rect x="162.188" y="137.842" class="st215" width="31.396" height="42.718"/><line class="st216" x1="168.886" y1="147.699" x2="186.26" y2="147.699"/><line class="st216" x1="168.886" y1="152.5" x2="182.886" y2="152.5"/><line class="st216" x1="168.886" y1="162.102" x2="182.886" y2="162.102"/><line class="st216" x1="168.886" y1="157.301" x2="186.26" y2="157.301"/><rect x="242.928" y="137.842" class="st215" width="31.396" height="42.718"/><line class="st216" x1="249.628" y1="147.699" x2="267.001" y2="147.699"/><line class="st216" x1="249.628" y1="152.5" x2="263.628" y2="152.5"/><line class="st216" x1="249.628" y1="162.102" x2="263.628" y2="162.102"/><line class="st216" x1="249.628" y1="157.301" x2="267.001" y2="157.301"/><rect x="333.677" y="137.842" class="st215" width="31.396" height="42.718"/><line class="st216" x1="340.376" y1="147.699" x2="357.75" y2="147.699"/><line class="st216" x1="340.376" y1="152.5" x2="354.376" y2="152.5"/><line class="st216" x1="340.376" y1="162.102" x2="354.376" y2="162.102"/><line class="st216" x1="340.376" y1="157.301" x2="357.75" y2="157.301"/><polygon class="st214" points="110.18,79.861 110.18,90.239 139.934,71.946 139.934,61.57 	"/><polygon class="st217" points="105.722,77.346 105.722,87.725 110.18,90.239 110.18,79.861 	"/><polygon class="st218" points="131.504,56.815 101.751,75.107 110.18,79.861 139.934,61.57 	"/><polygon class="st219" points="54.765,56.955 70.747,47.129 93.406,59.895 77.422,69.72 	"/><polygon class="st219" points="54.765,67.672 70.747,57.848 103.266,76.168 87.286,85.993 	"/><polygon class="st220" points="84.391,80.117 100.375,70.292 100.375,46.34 84.391,56.164 	"/><polygon class="st217" points="126.458,66.167 119.065,61.998 119.065,38.992 126.458,43.161 	"/><g>		<polygon class="st219" points="87.286,67.351 98.197,73.497 98.197,60.646 		"/><polygon class="st218" points="112.42,51.904 98.197,60.646 98.197,73.497 123.332,58.051 		"/></g>	<polygon class="st221" points="103.488,24.186 116.524,31.529 116.524,20.094 103.488,12.748 	"/><polygon class="st222" points="88.865,33.783 103.488,24.794 103.488,12.748 88.865,21.738 	"/><polygon class="st221" points="74.399,30.212 88.865,38.361 88.865,21.738 74.399,13.59 	"/><polygon class="st91" points="60.208,28.727 76.188,18.902 70.747,15.835 54.765,25.66 	"/><polygon class="st223" points="60.208,28.727 60.208,56.636 54.765,53.571 54.765,25.66 	"/><polygon class="st220" points="60.208,56.636 60.208,28.727 76.188,18.902 76.188,46.811 	"/><polygon class="st91" points="69.229,33.809 85.211,23.985 79.77,20.919 63.788,30.743 	"/><polygon class="st223" points="69.229,33.809 69.229,61.719 63.788,58.654 63.788,30.743 	"/><polygon class="st220" points="69.229,61.719 69.229,33.809 85.211,23.985 85.211,51.895 	"/><polygon class="st91" points="124.004,15.494 96.502,0 74.399,13.59 88.865,21.738 103.488,12.748 116.524,20.094 	"/><polygon class="st222" points="116.524,20.094 124.004,15.494 124.004,23.713 116.524,28.313 	"/><polygon class="st223" points="84.391,56.164 73.131,49.875 73.131,67.356 54.765,56.955 54.765,63.426 84.391,80.117 	"/><polygon class="st219" points="84.391,56.164 73.131,49.875 80.36,45.432 91.619,51.722 	"/><polygon class="st91" points="98.197,50.058 139.934,24.398 127.809,17.561 116.156,24.728 103.219,17.494 73.131,35.992 	"/><polygon class="st214" points="98.197,70.258 123.332,54.805 123.332,48.626 98.197,64.078 	"/><g>		<polygon class="st219" points="87.286,57.926 98.197,64.073 98.197,51.221 		"/></g>	<polygon class="st218" points="112.42,42.48 98.197,51.221 98.197,64.073 123.332,48.626 	"/><polygon class="st223" points="98.197,70.258 87.286,64.111 87.286,57.926 98.197,64.073 	"/><polygon class="st214" points="126.458,43.161 98.197,60.536 98.197,50.058 139.934,24.398 139.934,57.883 126.458,66.167 	"/><polygon class="st223" points="87.286,67.351 87.286,85.993 54.765,67.672 54.765,73.14 98.197,97.607 98.197,73.497 	"/><polygon class="st214" points="123.332,58.051 98.197,73.503 98.197,97.607 107.104,92.131 107.104,77.465 123.332,67.49 	"/><line class="st224" x1="98.202" y1="134.84" x2="98.202" y2="108.469"/><polyline class="st224" points="178.275,134.163 178.275,108.469 153.021,83.214 	"/><polyline class="st224" points="259.015,134.163 259.015,101.811 153.021,57.441 	"/><polyline class="st224" points="349.378,134.163 349.378,96.805 153.021,30.666 	"/><polyline class="st224" points="16.128,134.163 16.128,108.469 40.815,82.779 	"/><polygon class="st223" points="98.197,60.536 73.131,46.47 73.131,35.992 98.197,50.058 	"/></g><g id="search" data-size="17x17" class="nanobox-svg ">	<path class="st225" d="M10.692,0C7.606,0,5.093,2.511,5.093,5.597c0,1.022,0.271,1.979,0.761,2.812L0,14.259l1.938,1.942		l5.829-5.829c0.853,0.521,1.852,0.833,2.923,0.833c3.087,0,5.603-2.514,5.603-5.604C16.292,2.511,13.779,0,10.692,0z M10.692,8.458		c-1.574,0-2.858-1.283-2.858-2.861c0-1.562,1.284-2.854,2.858-2.854c1.578,0,2.86,1.282,2.86,2.854		C13.552,7.175,12.27,8.458,10.692,8.458z"/></g><g id="temp-search" data-size="253x31" class="nanobox-svg ">	<rect class="st168" width="252.308" height="30.625"/><g>		<path class="st225" d="M236.886,19.252c-2.515,0-4.562-2.048-4.562-4.562c0-2.52,2.049-4.562,4.562-4.562			c2.521,0,4.562,2.051,4.562,4.562C241.452,17.204,239.403,19.252,236.886,19.252L236.886,19.252z M236.886,12.358			c-1.28,0-2.331,1.047-2.331,2.329c0,1.287,1.048,2.332,2.331,2.332c1.287,0,2.333-1.045,2.333-2.332			C239.219,13.404,238.173,12.358,236.886,12.358L236.886,12.358z"/><polygon class="st225" points="229.752,23.325 228.172,21.742 233.63,16.287 235.209,17.867 		"/></g>	<g class="st50">		<path class="st226" d="M18.752,12.556c-0.039,0.064-0.08,0.113-0.124,0.146c-0.043,0.032-0.1,0.049-0.169,0.049			c-0.074,0-0.159-0.037-0.257-0.111c-0.097-0.073-0.221-0.154-0.37-0.243c-0.15-0.089-0.33-0.17-0.54-0.244			c-0.21-0.073-0.465-0.11-0.764-0.11c-0.282,0-0.531,0.038-0.748,0.114c-0.217,0.075-0.398,0.179-0.543,0.309			s-0.254,0.282-0.328,0.458s-0.11,0.365-0.11,0.568c0,0.261,0.063,0.476,0.191,0.647c0.128,0.171,0.297,0.317,0.507,0.438			c0.21,0.121,0.448,0.227,0.715,0.315s0.54,0.181,0.819,0.276c0.28,0.095,0.553,0.202,0.819,0.321			c0.266,0.119,0.504,0.27,0.715,0.452c0.21,0.182,0.379,0.405,0.507,0.669c0.128,0.265,0.192,0.59,0.192,0.976			c0,0.407-0.069,0.789-0.208,1.146c-0.139,0.358-0.341,0.669-0.608,0.934c-0.267,0.264-0.594,0.472-0.981,0.624			c-0.388,0.151-0.829,0.227-1.323,0.227c-0.602,0-1.151-0.109-1.647-0.328c-0.497-0.219-0.92-0.514-1.271-0.887l0.364-0.599			c0.034-0.047,0.077-0.087,0.126-0.12c0.05-0.032,0.105-0.049,0.166-0.049c0.091,0,0.195,0.049,0.312,0.146			c0.117,0.098,0.263,0.205,0.438,0.322c0.176,0.116,0.388,0.224,0.637,0.321c0.249,0.098,0.553,0.146,0.913,0.146			c0.299,0,0.565-0.041,0.799-0.124c0.234-0.082,0.433-0.198,0.595-0.348c0.163-0.149,0.287-0.328,0.374-0.536			c0.086-0.208,0.13-0.439,0.13-0.695c0-0.281-0.064-0.513-0.192-0.692c-0.127-0.18-0.295-0.33-0.503-0.451			c-0.208-0.122-0.445-0.225-0.712-0.31c-0.267-0.084-0.54-0.171-0.819-0.26c-0.28-0.089-0.553-0.191-0.819-0.309			c-0.266-0.117-0.503-0.269-0.711-0.455s-0.376-0.419-0.504-0.698c-0.128-0.28-0.192-0.625-0.192-1.037			c0-0.329,0.064-0.647,0.192-0.956c0.128-0.308,0.313-0.58,0.556-0.818s0.543-0.429,0.9-0.572c0.357-0.143,0.768-0.215,1.232-0.215			c0.52,0,0.994,0.083,1.423,0.247c0.429,0.165,0.804,0.403,1.125,0.716L18.752,12.556z"/><path class="st226" d="M23.296,13.726c0.394,0,0.758,0.066,1.092,0.198s0.622,0.323,0.865,0.572			c0.242,0.249,0.432,0.557,0.568,0.923c0.137,0.366,0.205,0.783,0.205,1.251c0,0.183-0.02,0.304-0.059,0.364			s-0.113,0.091-0.221,0.091h-4.381c0.009,0.416,0.065,0.778,0.169,1.086s0.247,0.564,0.429,0.77c0.182,0.206,0.398,0.36,0.65,0.462			c0.251,0.102,0.533,0.152,0.845,0.152c0.291,0,0.541-0.033,0.751-0.101c0.21-0.067,0.391-0.14,0.543-0.218			c0.151-0.078,0.278-0.15,0.38-0.218c0.102-0.067,0.189-0.101,0.263-0.101c0.096,0,0.169,0.037,0.221,0.11l0.325,0.423			c-0.143,0.173-0.314,0.324-0.514,0.451c-0.199,0.128-0.413,0.233-0.64,0.315c-0.228,0.083-0.463,0.145-0.706,0.186			s-0.483,0.062-0.721,0.062c-0.455,0-0.875-0.077-1.258-0.23c-0.383-0.154-0.715-0.379-0.995-0.676			c-0.279-0.297-0.497-0.664-0.653-1.103c-0.156-0.438-0.234-0.939-0.234-1.508c0-0.459,0.07-0.888,0.211-1.287			c0.141-0.398,0.343-0.744,0.607-1.036c0.265-0.293,0.587-0.522,0.969-0.689S22.819,13.726,23.296,13.726z M23.322,14.577			c-0.559,0-0.999,0.161-1.319,0.484c-0.321,0.322-0.52,0.771-0.598,1.342h3.582c0-0.269-0.037-0.515-0.111-0.737			c-0.074-0.224-0.182-0.416-0.325-0.579c-0.143-0.162-0.317-0.288-0.523-0.377C23.821,14.621,23.586,14.577,23.322,14.577z"/><path class="st226" d="M32.337,20.414h-0.514c-0.113,0-0.204-0.018-0.273-0.052c-0.069-0.035-0.115-0.108-0.137-0.222l-0.13-0.61			c-0.173,0.156-0.342,0.296-0.507,0.419c-0.165,0.124-0.338,0.228-0.52,0.312c-0.182,0.084-0.376,0.148-0.582,0.191			c-0.206,0.043-0.434,0.064-0.686,0.064c-0.256,0-0.495-0.035-0.718-0.107c-0.223-0.071-0.417-0.179-0.582-0.322			c-0.165-0.144-0.296-0.325-0.394-0.545c-0.097-0.22-0.146-0.479-0.146-0.779c0-0.261,0.071-0.512,0.214-0.753			c0.143-0.242,0.374-0.456,0.692-0.643c0.318-0.188,0.735-0.341,1.251-0.46c0.516-0.12,1.146-0.18,1.892-0.18v-0.517			c0-0.515-0.109-0.903-0.328-1.168c-0.219-0.264-0.543-0.396-0.972-0.396c-0.282,0-0.519,0.036-0.712,0.107s-0.36,0.151-0.5,0.24			c-0.141,0.089-0.262,0.169-0.364,0.24c-0.102,0.072-0.203,0.107-0.302,0.107c-0.078,0-0.146-0.021-0.205-0.062			s-0.105-0.092-0.14-0.152l-0.208-0.371c0.364-0.351,0.756-0.613,1.176-0.786c0.42-0.174,0.886-0.26,1.398-0.26			c0.368,0,0.695,0.061,0.981,0.182c0.286,0.121,0.526,0.29,0.721,0.507c0.195,0.217,0.342,0.479,0.442,0.787			c0.1,0.308,0.149,0.646,0.149,1.014V20.414z M29.334,19.705c0.204,0,0.39-0.021,0.559-0.062s0.329-0.1,0.478-0.175			c0.149-0.076,0.292-0.168,0.429-0.276c0.137-0.108,0.27-0.232,0.4-0.371v-1.358c-0.533,0-0.986,0.034-1.358,0.102			s-0.676,0.156-0.91,0.265c-0.234,0.109-0.404,0.237-0.51,0.386c-0.106,0.148-0.159,0.313-0.159,0.497			c0,0.174,0.028,0.324,0.084,0.451c0.056,0.126,0.132,0.229,0.228,0.311c0.095,0.08,0.208,0.14,0.338,0.177			S29.182,19.705,29.334,19.705z"/><path class="st226" d="M34.092,20.414v-6.585h0.663c0.126,0,0.212,0.024,0.26,0.072c0.047,0.048,0.08,0.13,0.098,0.247			l0.078,1.026c0.226-0.459,0.504-0.817,0.835-1.075s0.72-0.387,1.167-0.387c0.182,0,0.347,0.021,0.494,0.062			s0.284,0.099,0.41,0.172l-0.149,0.865c-0.031,0.107-0.098,0.162-0.202,0.162c-0.061,0-0.154-0.021-0.28-0.062			c-0.125-0.041-0.301-0.062-0.526-0.062c-0.403,0-0.74,0.117-1.011,0.352s-0.497,0.574-0.679,1.021v4.192H34.092z"/><path class="st226" d="M43.822,15c-0.035,0.047-0.069,0.084-0.104,0.11c-0.035,0.025-0.084,0.039-0.149,0.039			s-0.135-0.027-0.211-0.082c-0.076-0.054-0.172-0.113-0.289-0.179c-0.117-0.064-0.259-0.124-0.426-0.179			c-0.167-0.054-0.372-0.081-0.614-0.081c-0.321,0-0.604,0.058-0.852,0.173c-0.247,0.114-0.454,0.28-0.621,0.497			c-0.167,0.217-0.292,0.479-0.377,0.786s-0.127,0.652-0.127,1.033c0,0.399,0.045,0.753,0.137,1.063			c0.091,0.31,0.219,0.569,0.383,0.779c0.165,0.211,0.365,0.371,0.602,0.481c0.236,0.11,0.501,0.166,0.796,0.166			c0.282,0,0.514-0.034,0.696-0.102c0.182-0.066,0.333-0.142,0.455-0.224c0.122-0.082,0.221-0.157,0.299-0.225			s0.156-0.101,0.234-0.101c0.1,0,0.173,0.037,0.221,0.11l0.325,0.423c-0.286,0.351-0.644,0.607-1.072,0.771			c-0.429,0.162-0.882,0.243-1.358,0.243c-0.412,0-0.794-0.076-1.147-0.228s-0.66-0.371-0.92-0.659			c-0.26-0.288-0.464-0.643-0.614-1.063c-0.149-0.42-0.224-0.898-0.224-1.437c0-0.489,0.068-0.942,0.205-1.358			c0.137-0.416,0.336-0.774,0.598-1.075c0.262-0.302,0.586-0.536,0.972-0.705s0.828-0.254,1.326-0.254			c0.459,0,0.867,0.075,1.222,0.225c0.355,0.149,0.669,0.36,0.942,0.634L43.822,15z"/><path class="st226" d="M45.402,20.414V10.84h1.157v3.874c0.282-0.299,0.594-0.539,0.936-0.719s0.737-0.27,1.183-0.27			c0.359,0,0.677,0.06,0.952,0.179c0.275,0.119,0.505,0.288,0.689,0.507s0.324,0.482,0.419,0.79			c0.095,0.308,0.143,0.647,0.143,1.021v4.192h-1.157v-4.192c0-0.498-0.114-0.885-0.341-1.16s-0.575-0.413-1.043-0.413			c-0.343,0-0.662,0.082-0.959,0.247s-0.571,0.388-0.822,0.67v4.849H45.402z"/><path class="st226" d="M59.974,20.414h-0.514c-0.113,0-0.204-0.018-0.273-0.052c-0.069-0.035-0.115-0.108-0.137-0.222l-0.13-0.61			c-0.173,0.156-0.342,0.296-0.507,0.419c-0.165,0.124-0.338,0.228-0.52,0.312c-0.182,0.084-0.376,0.148-0.582,0.191			c-0.206,0.043-0.434,0.064-0.686,0.064c-0.256,0-0.495-0.035-0.718-0.107c-0.223-0.071-0.417-0.179-0.582-0.322			c-0.165-0.144-0.296-0.325-0.394-0.545c-0.097-0.22-0.146-0.479-0.146-0.779c0-0.261,0.071-0.512,0.214-0.753			c0.143-0.242,0.374-0.456,0.692-0.643c0.318-0.188,0.735-0.341,1.251-0.46c0.516-0.12,1.146-0.18,1.892-0.18v-0.517			c0-0.515-0.109-0.903-0.328-1.168c-0.219-0.264-0.543-0.396-0.972-0.396c-0.282,0-0.519,0.036-0.712,0.107s-0.36,0.151-0.5,0.24			c-0.141,0.089-0.262,0.169-0.364,0.24c-0.102,0.072-0.203,0.107-0.302,0.107c-0.078,0-0.146-0.021-0.205-0.062			s-0.105-0.092-0.14-0.152l-0.208-0.371c0.364-0.351,0.756-0.613,1.176-0.786c0.42-0.174,0.886-0.26,1.398-0.26			c0.368,0,0.695,0.061,0.981,0.182c0.286,0.121,0.526,0.29,0.721,0.507c0.195,0.217,0.342,0.479,0.442,0.787			c0.1,0.308,0.149,0.646,0.149,1.014V20.414z M56.972,19.705c0.204,0,0.39-0.021,0.559-0.062s0.329-0.1,0.478-0.175			c0.149-0.076,0.292-0.168,0.429-0.276c0.137-0.108,0.27-0.232,0.4-0.371v-1.358c-0.533,0-0.986,0.034-1.358,0.102			s-0.676,0.156-0.91,0.265c-0.234,0.109-0.404,0.237-0.51,0.386c-0.106,0.148-0.159,0.313-0.159,0.497			c0,0.174,0.028,0.324,0.084,0.451c0.056,0.126,0.132,0.229,0.228,0.311c0.095,0.08,0.208,0.14,0.338,0.177			S56.82,19.705,56.972,19.705z"/><path class="st226" d="M63.016,10.84v9.574h-1.157V10.84H63.016z"/><path class="st226" d="M66.344,10.84v9.574h-1.157V10.84H66.344z"/><path class="st226" d="M76.816,11.1v1.027h-4.472v3.094h3.621v0.988h-3.621v3.178h4.472v1.027h-5.74V11.1H76.816z"/><path class="st226" d="M78.447,20.414v-6.585h0.689c0.165,0,0.269,0.081,0.312,0.241l0.091,0.715			c0.286-0.316,0.605-0.572,0.958-0.768c0.354-0.194,0.762-0.292,1.226-0.292c0.359,0,0.677,0.06,0.952,0.179			c0.275,0.119,0.505,0.288,0.689,0.507s0.324,0.482,0.419,0.79c0.095,0.308,0.143,0.647,0.143,1.021v4.192h-1.157v-4.192			c0-0.498-0.114-0.885-0.341-1.16s-0.575-0.413-1.043-0.413c-0.343,0-0.662,0.082-0.959,0.247s-0.571,0.388-0.822,0.67v4.849			H78.447z"/><path class="st226" d="M87.891,13.719c0.286,0,0.554,0.032,0.803,0.095s0.476,0.155,0.679,0.276h1.788v0.429			c0,0.143-0.091,0.234-0.273,0.273l-0.748,0.104c0.147,0.282,0.221,0.596,0.221,0.942c0,0.321-0.062,0.612-0.186,0.874			c-0.124,0.263-0.295,0.487-0.514,0.673c-0.219,0.187-0.479,0.33-0.78,0.43s-0.632,0.149-0.991,0.149			c-0.308,0-0.598-0.037-0.871-0.11c-0.139,0.089-0.244,0.186-0.315,0.288c-0.072,0.104-0.107,0.204-0.107,0.303			c0,0.161,0.062,0.283,0.188,0.366c0.125,0.083,0.292,0.143,0.5,0.179c0.208,0.035,0.444,0.054,0.708,0.054s0.534,0,0.809,0			c0.275,0,0.545,0.023,0.81,0.072c0.264,0.048,0.5,0.127,0.708,0.236c0.208,0.11,0.375,0.262,0.5,0.454			c0.125,0.193,0.188,0.443,0.188,0.75c0,0.285-0.071,0.562-0.211,0.829s-0.343,0.506-0.608,0.714			c-0.264,0.209-0.587,0.375-0.968,0.5s-0.812,0.188-1.293,0.188s-0.902-0.047-1.264-0.143s-0.662-0.224-0.9-0.384			c-0.238-0.161-0.417-0.347-0.536-0.557c-0.12-0.21-0.179-0.431-0.179-0.66c0-0.325,0.103-0.603,0.309-0.83			c0.206-0.228,0.488-0.408,0.848-0.543c-0.187-0.087-0.334-0.202-0.445-0.348c-0.11-0.145-0.166-0.338-0.166-0.58			c0-0.096,0.017-0.194,0.052-0.296s0.088-0.202,0.159-0.302c0.072-0.1,0.16-0.194,0.264-0.285s0.225-0.171,0.364-0.24			c-0.325-0.182-0.58-0.424-0.764-0.725c-0.184-0.302-0.276-0.653-0.276-1.057c0-0.32,0.062-0.612,0.186-0.874			c0.123-0.262,0.295-0.485,0.517-0.67c0.221-0.184,0.484-0.325,0.79-0.426C87.193,13.769,87.527,13.719,87.891,13.719z			 M89.946,20.748c0-0.168-0.046-0.303-0.137-0.404s-0.214-0.18-0.371-0.235c-0.156-0.056-0.336-0.096-0.54-0.122			c-0.204-0.027-0.418-0.04-0.644-0.04c-0.225,0-0.455,0-0.689,0c-0.234,0-0.457-0.029-0.669-0.088			c-0.247,0.117-0.447,0.261-0.601,0.43s-0.231,0.371-0.231,0.605c0,0.147,0.038,0.285,0.114,0.413s0.192,0.239,0.348,0.332			c0.156,0.094,0.352,0.167,0.588,0.222c0.236,0.054,0.515,0.081,0.835,0.081c0.312,0,0.591-0.028,0.838-0.086			s0.456-0.14,0.627-0.245c0.171-0.106,0.302-0.232,0.393-0.378C89.9,21.086,89.946,20.925,89.946,20.748z M87.891,17.196			c0.234,0,0.441-0.032,0.621-0.098c0.18-0.064,0.331-0.155,0.452-0.272c0.122-0.117,0.212-0.257,0.273-0.419			c0.061-0.163,0.091-0.342,0.091-0.537c0-0.402-0.123-0.724-0.367-0.962c-0.245-0.238-0.602-0.357-1.069-0.357			c-0.464,0-0.818,0.119-1.063,0.357c-0.245,0.238-0.367,0.56-0.367,0.962c0,0.195,0.032,0.374,0.094,0.537			c0.063,0.162,0.155,0.302,0.276,0.419s0.271,0.208,0.449,0.272C87.458,17.164,87.661,17.196,87.891,17.196z"/><path class="st226" d="M93.865,11.763c0,0.112-0.023,0.218-0.068,0.315s-0.106,0.184-0.182,0.26s-0.164,0.136-0.263,0.179			s-0.206,0.065-0.318,0.065s-0.218-0.022-0.315-0.065c-0.097-0.043-0.184-0.103-0.26-0.179c-0.076-0.076-0.136-0.162-0.179-0.26			c-0.043-0.098-0.065-0.203-0.065-0.315s0.021-0.22,0.065-0.322c0.043-0.102,0.103-0.19,0.179-0.267			c0.076-0.075,0.163-0.135,0.26-0.179c0.098-0.043,0.203-0.064,0.315-0.064s0.219,0.021,0.318,0.064			c0.1,0.044,0.188,0.104,0.263,0.179c0.076,0.076,0.137,0.165,0.182,0.267C93.842,11.543,93.865,11.651,93.865,11.763z			 M93.605,13.829v6.585h-1.157v-6.585H93.605z"/><path class="st226" d="M95.646,20.414v-6.585h0.689c0.165,0,0.269,0.081,0.312,0.241l0.091,0.715			c0.286-0.316,0.605-0.572,0.958-0.768c0.354-0.194,0.762-0.292,1.226-0.292c0.359,0,0.677,0.06,0.952,0.179			c0.275,0.119,0.505,0.288,0.689,0.507s0.324,0.482,0.419,0.79c0.095,0.308,0.143,0.647,0.143,1.021v4.192h-1.157v-4.192			c0-0.498-0.114-0.885-0.341-1.16s-0.575-0.413-1.043-0.413c-0.343,0-0.662,0.082-0.959,0.247s-0.571,0.388-0.822,0.67v4.849			H95.646z"/><path class="st226" d="M105.48,13.726c0.394,0,0.758,0.066,1.092,0.198s0.622,0.323,0.865,0.572			c0.242,0.249,0.432,0.557,0.568,0.923c0.137,0.366,0.205,0.783,0.205,1.251c0,0.183-0.02,0.304-0.059,0.364			s-0.113,0.091-0.221,0.091h-4.381c0.009,0.416,0.065,0.778,0.169,1.086s0.247,0.564,0.429,0.77c0.182,0.206,0.398,0.36,0.65,0.462			c0.251,0.102,0.533,0.152,0.845,0.152c0.291,0,0.541-0.033,0.751-0.101c0.21-0.067,0.391-0.14,0.543-0.218			c0.151-0.078,0.278-0.15,0.38-0.218c0.102-0.067,0.189-0.101,0.263-0.101c0.096,0,0.169,0.037,0.221,0.11l0.325,0.423			c-0.143,0.173-0.314,0.324-0.514,0.451c-0.199,0.128-0.413,0.233-0.64,0.315c-0.228,0.083-0.463,0.145-0.706,0.186			s-0.483,0.062-0.721,0.062c-0.455,0-0.875-0.077-1.258-0.23c-0.383-0.154-0.715-0.379-0.995-0.676			c-0.279-0.297-0.497-0.664-0.653-1.103c-0.156-0.438-0.234-0.939-0.234-1.508c0-0.459,0.07-0.888,0.211-1.287			c0.141-0.398,0.343-0.744,0.607-1.036c0.265-0.293,0.587-0.522,0.969-0.689S105.003,13.726,105.48,13.726z M105.506,14.577			c-0.559,0-0.999,0.161-1.319,0.484c-0.321,0.322-0.52,0.771-0.598,1.342h3.582c0-0.269-0.037-0.515-0.111-0.737			c-0.074-0.224-0.182-0.416-0.325-0.579c-0.143-0.162-0.317-0.288-0.523-0.377C106.006,14.621,105.77,14.577,105.506,14.577z"/><path class="st226" d="M113.455,14.915c-0.052,0.096-0.132,0.143-0.24,0.143c-0.064,0-0.139-0.023-0.221-0.071			s-0.184-0.101-0.303-0.159s-0.261-0.112-0.426-0.162c-0.165-0.05-0.359-0.075-0.585-0.075c-0.195,0-0.37,0.025-0.526,0.075			c-0.156,0.05-0.289,0.118-0.4,0.204c-0.11,0.087-0.195,0.188-0.253,0.303s-0.088,0.239-0.088,0.374			c0,0.169,0.049,0.31,0.146,0.422c0.098,0.113,0.227,0.211,0.387,0.293s0.342,0.155,0.546,0.218s0.413,0.13,0.627,0.201			s0.423,0.15,0.627,0.237s0.386,0.195,0.546,0.325s0.289,0.289,0.387,0.478s0.146,0.415,0.146,0.68			c0,0.303-0.055,0.584-0.163,0.842s-0.269,0.48-0.481,0.669c-0.212,0.188-0.472,0.337-0.779,0.445s-0.663,0.162-1.066,0.162			c-0.459,0-0.875-0.074-1.248-0.224s-0.689-0.342-0.949-0.575l0.273-0.442c0.035-0.056,0.076-0.1,0.124-0.13			c0.048-0.03,0.111-0.046,0.188-0.046c0.078,0,0.161,0.031,0.247,0.092c0.087,0.061,0.192,0.128,0.315,0.201			c0.124,0.074,0.273,0.141,0.448,0.201c0.176,0.062,0.396,0.092,0.66,0.092c0.225,0,0.422-0.029,0.591-0.088			s0.31-0.138,0.422-0.237s0.196-0.215,0.25-0.345s0.081-0.269,0.081-0.416c0-0.182-0.049-0.333-0.146-0.452			c-0.098-0.119-0.227-0.221-0.387-0.305c-0.161-0.085-0.344-0.158-0.549-0.222c-0.206-0.062-0.416-0.129-0.631-0.198			c-0.214-0.069-0.424-0.148-0.63-0.237c-0.206-0.089-0.389-0.2-0.549-0.334c-0.16-0.135-0.289-0.301-0.387-0.498			c-0.097-0.197-0.146-0.437-0.146-0.718c0-0.251,0.052-0.493,0.156-0.725c0.104-0.232,0.256-0.436,0.455-0.611			s0.444-0.315,0.734-0.419c0.291-0.104,0.622-0.156,0.995-0.156c0.433,0,0.822,0.068,1.167,0.205			c0.344,0.136,0.642,0.323,0.893,0.562L113.455,14.915z"/></g></g><g id="code-build" data-size="214x86" class="nanobox-svg ">	<polyline class="st227" points="185.635,36.262 109.164,76.664 48.381,45.848 	"/><polygon class="st30" points="48.278,47.735 46.586,44.916 52.012,45.621 	"/><polyline class="st227" points="185.635,44.85 109.164,85.25 50.444,55.233 	"/><polyline class="st227" points="159.928,41.508 109.164,68.076 78.725,52.563 	"/><polygon class="st52" points="213.11,16.145 183.694,31.588 153.404,15.973 182.838,0.543 	"/><polygon class="st118" points="213.11,40.102 213.11,16.147 183.694,31.588 183.692,54.785 	"/><polygon class="st119" points="183.694,31.588 153.404,15.973 153.404,39.297 183.692,54.785 	"/><polygon class="st60" points="90.836,15.602 30.291,47.41 0,31.795 60.565,0 	"/><polygon class="st61" points="90.836,39.559 90.836,15.604 30.291,47.41 30.289,70.608 	"/><polygon class="st62" points="30.291,47.41 0,31.795 0,55.121 30.289,70.608 	"/><polygon class="st15" points="59.707,31.901 56.272,33.686 25.983,18.069 29.436,16.299 	"/><polygon class="st18" points="56.272,33.686 59.707,31.901 59.707,55.465 56.272,57.25 	"/><polygon class="st15" points="69.307,27.231 65.871,29.016 35.582,13.399 39.035,11.629 	"/><polygon class="st18" points="65.871,29.016 69.307,27.231 69.307,50.795 65.871,52.58 	"/><polygon class="st15" points="50.738,36.795 47.303,38.578 17.014,22.963 20.467,21.192 	"/><polygon class="st18" points="47.303,38.578 50.738,36.795 50.738,60.36 47.303,62.143 	"/><polygon class="st52" points="78.824,54.561 77.133,51.741 82.557,52.448 	"/><polygon class="st91" points="209.149,18.282 207.067,19.334 176.776,3.717 178.877,2.682 	"/><polygon class="st91" points="207.067,19.334 209.149,18.282 209.149,41.848 207.067,42.899 	"/><polygon class="st91" points="202.16,21.951 200.078,23.002 169.789,7.385 171.889,6.35 	"/><polygon class="st91" points="200.078,23.002 202.16,21.951 202.16,45.516 200.078,46.567 	"/><polygon class="st91" points="194.192,26.078 192.111,27.127 161.82,11.512 163.92,10.475 	"/><polygon class="st91" points="192.111,27.127 194.192,26.078 194.192,49.643 192.111,50.692 	"/></g><g id="documentation" data-size="22x19" class="nanobox-svg ">	<path class="st26" d="M21.073,0.419c-0.021-0.246-0.212-0.436-0.472-0.418c-0.246,0.02-0.438,0.229-0.42,0.478l0.664,11.653		c-5.393-0.421-9.207,1.938-9.442,2.102c-0.312,0.304-0.673,0.304-1.043-0.056c-0.165-0.105-3.988-2.659-9.44-2.184L1.583,0.548		c0.021-0.24-0.173-0.456-0.42-0.471C0.892,0.072,0.708,0.25,0.689,0.495L0.001,12.474c-0.007,0.133,0.045,0.261,0.146,0.354		c0.097,0.088,0.229,0.131,0.355,0.117c5.354-0.658,9.279,1.927,9.301,1.927l0,0c0.333,0.33,0.733,0.488,1.133,0.488		c0.372,0,0.737-0.146,1.021-0.436c0.037-0.021,3.996-2.438,9.313-1.853c0.14,0.017,0.271-0.03,0.354-0.12		c0.1-0.092,0.146-0.219,0.143-0.349L21.073,0.419z"/><path class="st26" d="M20.532,14.682c-5.229-0.655-9.095,2.146-9.312,2.312c-0.155,0.159-0.464,0.133-0.646-0.042		c-0.16-0.12-4.037-2.928-9.258-2.271c-0.24,0.026-0.418,0.255-0.392,0.498c0.03,0.239,0.262,0.414,0.496,0.388		c4.854-0.606,8.565,2.062,8.57,2.062c0.255,0.244,0.604,0.365,0.938,0.365c0.326,0,0.646-0.104,0.858-0.325		c0.039-0.021,3.748-2.719,8.62-2.104c0.239,0.03,0.466-0.146,0.496-0.395C20.952,14.937,20.775,14.716,20.532,14.682z"/><path class="st26" d="M19.29,10.671L18.677,0.275c-4.131,0-6.229,1-7.155,1.633v10.429C12.731,11.63,15.665,10.218,19.29,10.671z"		/><path class="st26" d="M10.333,12.341V1.913c-0.916-0.634-3.021-1.639-7.16-1.639L2.557,10.67		C6.191,10.218,9.129,11.634,10.333,12.341z"/></g><g id="mobile-open" data-size="26x17" class="nanobox-svg ">	<line class="st228" x1="1.426" y1="1.426" x2="24.467" y2="1.426"/><line class="st228" x1="1.426" y1="8.192" x2="24.467" y2="8.192"/><line class="st228" x1="1.426" y1="14.957" x2="24.467" y2="14.957"/></g><g id="mobile-close" data-size="21x21" class="nanobox-svg ">	<line class="st229" x1="1.553" y1="1.553" x2="19.29" y2="19.291"/><line class="st229" x1="19.29" y1="1.553" x2="1.553" y2="19.291"/></g><g id="view-demo" data-size="141x103" class="nanobox-svg ">	<g>		<path class="st230" d="M140.157,79.488c0,1.646-1.354,3-3,3H3c-1.649,0-3-1.354-3-3V3c0-1.65,1.351-3,3-3h134.157			c1.646,0,3,1.35,3,3V79.488z"/></g>	<circle class="st231" cx="70.079" cy="40.294" r="24.489"/><g class="st50">		<path class="st232" d="M41.117,91.957h1.043c0.116,0,0.208,0.03,0.272,0.091c0.066,0.062,0.109,0.136,0.133,0.225l1.674,7.168			c0.037,0.149,0.073,0.313,0.108,0.493c0.034,0.18,0.063,0.368,0.087,0.563c0.066-0.195,0.135-0.383,0.207-0.56			c0.072-0.178,0.146-0.343,0.221-0.497l3.423-7.168c0.037-0.075,0.099-0.146,0.186-0.214c0.086-0.067,0.186-0.102,0.298-0.102			h1.049l-4.99,10.031h-1.184L41.117,91.957z"/><path class="st232" d="M51.806,94.898l-0.854,7.091h-1.225l0.854-7.091H51.806z M52.274,92.671c0,0.122-0.023,0.235-0.072,0.34			c-0.05,0.105-0.115,0.198-0.197,0.28c-0.081,0.081-0.174,0.146-0.275,0.192c-0.104,0.047-0.211,0.07-0.322,0.07			c-0.107,0-0.213-0.023-0.315-0.07s-0.192-0.111-0.269-0.192c-0.078-0.082-0.14-0.175-0.186-0.28			c-0.047-0.104-0.07-0.218-0.07-0.34c0-0.121,0.023-0.235,0.07-0.343c0.046-0.107,0.109-0.201,0.188-0.283s0.17-0.147,0.272-0.196			c0.104-0.049,0.208-0.073,0.315-0.073c0.112,0,0.22,0.023,0.321,0.07c0.104,0.046,0.195,0.11,0.277,0.192			c0.082,0.081,0.146,0.177,0.192,0.287C52.251,92.435,52.274,92.55,52.274,92.671z"/><path class="st232" d="M58.638,96.416c0,0.309-0.062,0.592-0.189,0.851c-0.125,0.259-0.356,0.492-0.692,0.7			s-0.798,0.389-1.386,0.543c-0.588,0.153-1.344,0.277-2.269,0.37c-0.005,0.052-0.007,0.102-0.007,0.151c0,0.049,0,0.099,0,0.15			c0,0.625,0.137,1.103,0.41,1.431c0.272,0.329,0.684,0.494,1.234,0.494c0.225,0,0.424-0.023,0.6-0.07			c0.174-0.047,0.33-0.104,0.469-0.171c0.137-0.068,0.259-0.143,0.363-0.225c0.105-0.081,0.202-0.156,0.291-0.224			c0.088-0.067,0.17-0.125,0.244-0.172c0.075-0.047,0.15-0.07,0.225-0.07c0.084,0,0.161,0.04,0.23,0.119l0.309,0.386			c-0.238,0.247-0.471,0.458-0.696,0.633c-0.227,0.175-0.458,0.321-0.696,0.438c-0.238,0.117-0.486,0.202-0.746,0.256			c-0.259,0.054-0.537,0.08-0.836,0.08c-0.406,0-0.771-0.067-1.092-0.203c-0.322-0.135-0.596-0.327-0.82-0.577			c-0.223-0.249-0.396-0.552-0.518-0.906s-0.182-0.751-0.182-1.19c0-0.363,0.039-0.727,0.115-1.088			c0.077-0.362,0.189-0.706,0.336-1.033c0.147-0.326,0.326-0.63,0.539-0.909c0.213-0.28,0.455-0.521,0.729-0.725			c0.272-0.203,0.574-0.363,0.902-0.479c0.329-0.117,0.683-0.176,1.061-0.176c0.359,0,0.67,0.052,0.932,0.154			c0.261,0.103,0.476,0.233,0.644,0.393c0.168,0.158,0.293,0.333,0.374,0.524C58.597,96.062,58.638,96.244,58.638,96.416z			 M56.495,95.695c-0.293,0-0.564,0.061-0.812,0.182c-0.247,0.122-0.467,0.288-0.657,0.501c-0.191,0.212-0.355,0.462-0.49,0.749			c-0.136,0.287-0.24,0.596-0.315,0.928c0.719-0.089,1.295-0.19,1.729-0.305c0.434-0.114,0.768-0.238,1-0.371			c0.234-0.133,0.388-0.276,0.463-0.431c0.074-0.154,0.111-0.315,0.111-0.483c0-0.084-0.019-0.171-0.056-0.262			c-0.038-0.092-0.097-0.174-0.179-0.249c-0.082-0.074-0.188-0.137-0.318-0.186S56.683,95.695,56.495,95.695z"/><path class="st232" d="M59.491,94.898h0.932c0.094,0,0.169,0.023,0.228,0.069c0.058,0.047,0.092,0.11,0.102,0.189l0.651,4.564			c0.023,0.163,0.035,0.32,0.038,0.472c0.002,0.152,0.006,0.303,0.011,0.452c0.056-0.149,0.113-0.3,0.172-0.452			c0.058-0.151,0.119-0.309,0.185-0.472l1.939-4.593c0.028-0.069,0.073-0.128,0.136-0.175c0.063-0.047,0.135-0.07,0.214-0.07h0.519			c0.093,0,0.165,0.023,0.217,0.07c0.051,0.047,0.082,0.105,0.091,0.175l0.791,4.593c0.028,0.163,0.05,0.321,0.066,0.476			s0.032,0.308,0.046,0.462c0.047-0.149,0.092-0.302,0.137-0.458c0.044-0.156,0.099-0.316,0.164-0.479l1.792-4.564			c0.028-0.074,0.075-0.137,0.14-0.186c0.065-0.049,0.141-0.073,0.225-0.073h0.896l-2.976,7.091H65.26			c-0.107,0-0.175-0.079-0.203-0.238l-0.86-4.809c-0.015-0.075-0.026-0.15-0.035-0.228c-0.01-0.077-0.02-0.153-0.028-0.228			c-0.023,0.079-0.047,0.156-0.069,0.23c-0.023,0.075-0.053,0.152-0.084,0.231l-2.052,4.802c-0.065,0.159-0.159,0.238-0.28,0.238			h-0.91L59.491,94.898z"/><path class="st232" d="M80.946,96.27c0,0.854-0.132,1.632-0.395,2.334c-0.264,0.703-0.629,1.305-1.093,1.807			c-0.464,0.501-1.017,0.89-1.659,1.165c-0.642,0.275-1.34,0.413-2.096,0.413h-3.465l1.238-10.031h3.458			c0.616,0,1.173,0.105,1.669,0.315c0.498,0.21,0.918,0.505,1.264,0.886c0.346,0.38,0.611,0.835,0.799,1.364			C80.853,95.053,80.946,95.635,80.946,96.27z M79.603,96.297c0-0.504-0.064-0.959-0.192-1.364c-0.128-0.406-0.313-0.75-0.554-1.033			c-0.24-0.282-0.533-0.499-0.878-0.65s-0.735-0.228-1.169-0.228h-2.143l-0.979,7.91h2.142c0.561,0,1.071-0.106,1.533-0.319			c0.463-0.212,0.859-0.518,1.19-0.917c0.331-0.398,0.589-0.884,0.773-1.455C79.511,97.668,79.603,97.021,79.603,96.297z"/><path class="st232" d="M87.421,96.416c0,0.309-0.062,0.592-0.188,0.851s-0.356,0.492-0.692,0.7s-0.799,0.389-1.387,0.543			c-0.588,0.153-1.344,0.277-2.268,0.37c-0.005,0.052-0.008,0.102-0.008,0.151c0,0.049,0,0.099,0,0.15			c0,0.625,0.137,1.103,0.41,1.431c0.273,0.329,0.685,0.494,1.235,0.494c0.224,0,0.423-0.023,0.599-0.07			c0.175-0.047,0.331-0.104,0.469-0.171c0.138-0.068,0.26-0.143,0.364-0.225c0.104-0.081,0.202-0.156,0.29-0.224			c0.089-0.067,0.17-0.125,0.245-0.172s0.149-0.07,0.224-0.07c0.084,0,0.162,0.04,0.231,0.119l0.308,0.386			c-0.237,0.247-0.47,0.458-0.695,0.633c-0.227,0.175-0.459,0.321-0.697,0.438c-0.238,0.117-0.486,0.202-0.746,0.256			c-0.258,0.054-0.537,0.08-0.836,0.08c-0.406,0-0.77-0.067-1.092-0.203c-0.322-0.135-0.596-0.327-0.819-0.577			c-0.224-0.249-0.396-0.552-0.518-0.906c-0.122-0.354-0.183-0.751-0.183-1.19c0-0.363,0.039-0.727,0.115-1.088			c0.078-0.362,0.189-0.706,0.336-1.033c0.148-0.326,0.327-0.63,0.539-0.909c0.213-0.28,0.455-0.521,0.729-0.725			s0.574-0.363,0.903-0.479c0.329-0.117,0.683-0.176,1.061-0.176c0.358,0,0.669,0.052,0.931,0.154s0.477,0.233,0.645,0.393			c0.168,0.158,0.293,0.333,0.374,0.524S87.421,96.244,87.421,96.416z M85.279,95.695c-0.294,0-0.564,0.061-0.812,0.182			c-0.248,0.122-0.467,0.288-0.658,0.501c-0.191,0.212-0.355,0.462-0.49,0.749s-0.24,0.596-0.314,0.928			c0.719-0.089,1.295-0.19,1.729-0.305s0.768-0.238,1.001-0.371s0.388-0.276,0.462-0.431s0.112-0.315,0.112-0.483			c0-0.084-0.019-0.171-0.056-0.262c-0.038-0.092-0.098-0.174-0.18-0.249c-0.081-0.074-0.188-0.137-0.318-0.186			S85.466,95.695,85.279,95.695z"/><path class="st232" d="M88.206,101.988l0.854-7.098h0.623c0.279,0,0.42,0.14,0.42,0.42l-0.098,1.267			c0.35-0.588,0.732-1.032,1.147-1.333c0.415-0.302,0.854-0.452,1.315-0.452c0.481,0,0.836,0.165,1.064,0.494			s0.344,0.799,0.344,1.41c0.354-0.648,0.752-1.128,1.193-1.438c0.44-0.311,0.904-0.466,1.389-0.466			c0.523,0,0.914,0.171,1.173,0.512c0.259,0.34,0.389,0.83,0.389,1.47c0,0.107-0.005,0.22-0.015,0.336			c-0.009,0.116-0.021,0.238-0.034,0.364l-0.532,4.515h-1.225l0.531-4.515c0.028-0.229,0.043-0.437,0.043-0.623			c0-0.351-0.059-0.608-0.176-0.773c-0.117-0.166-0.312-0.249-0.588-0.249c-0.201,0-0.401,0.051-0.602,0.15			c-0.201,0.101-0.395,0.248-0.582,0.441c-0.186,0.193-0.359,0.434-0.521,0.721c-0.16,0.287-0.304,0.617-0.43,0.99l-0.455,3.857			h-1.232l0.539-4.515c0.014-0.126,0.025-0.245,0.035-0.357s0.014-0.217,0.014-0.314c0-0.332-0.055-0.577-0.164-0.735			c-0.109-0.159-0.303-0.238-0.578-0.238c-0.223,0-0.439,0.057-0.646,0.168c-0.208,0.112-0.404,0.274-0.588,0.486			c-0.186,0.213-0.356,0.472-0.516,0.777c-0.158,0.306-0.303,0.65-0.434,1.032l-0.441,3.696H88.206z"/><path class="st232" d="M101.701,102.086c-0.388,0-0.741-0.066-1.063-0.199s-0.6-0.325-0.834-0.577			c-0.232-0.252-0.415-0.561-0.545-0.924c-0.131-0.364-0.197-0.779-0.197-1.246c0-0.598,0.094-1.16,0.281-1.688			c0.186-0.527,0.441-0.989,0.766-1.386s0.707-0.709,1.148-0.938c0.441-0.229,0.918-0.343,1.432-0.343			c0.387,0,0.742,0.066,1.064,0.199c0.321,0.134,0.6,0.326,0.832,0.578c0.233,0.252,0.416,0.561,0.547,0.928			c0.13,0.366,0.195,0.78,0.195,1.242c0,0.593-0.094,1.152-0.279,1.68c-0.188,0.527-0.443,0.989-0.768,1.386			c-0.324,0.397-0.707,0.711-1.15,0.942C102.687,101.971,102.21,102.086,101.701,102.086z M101.813,101.113			c0.34,0,0.65-0.094,0.931-0.28s0.519-0.435,0.714-0.745c0.196-0.311,0.348-0.669,0.455-1.074c0.107-0.406,0.161-0.831,0.161-1.274			c0-0.653-0.128-1.146-0.385-1.477c-0.257-0.332-0.628-0.497-1.113-0.497c-0.345,0-0.657,0.092-0.935,0.276			s-0.514,0.432-0.711,0.742c-0.195,0.31-0.348,0.668-0.455,1.074s-0.16,0.831-0.16,1.273c0,0.654,0.127,1.147,0.381,1.48			C100.951,100.946,101.323,101.113,101.813,101.113z"/></g>	<polygon  class="triangle st233" points="64.537,51.596 64.537,31.405 80.735,41.501 	"/></g><g id="manifesto-automation" data-size="63x64" class="nanobox-svg ">	<path class="st234" d="M32.641,55.42c0,3.56-2.885,6.444-6.444,6.444h-0.16c-4.903,0-8.88-3.978-8.88-8.882V26.255"/><line class="st234" x1="24.326" y1="5.897" x2="24.326" y2="36.663"/><line class="st234" x1="31.497" y1="0" x2="31.497" y2="36.663"/><line class="st234" x1="38.666" y1="5.897" x2="38.666" y2="36.663"/><line class="st234" x1="45.835" y1="16.409" x2="45.835" y2="54.154"/><path class="st234" d="M32.641,55.42c0,3.56-2.885,6.444-6.444,6.444"/><path class="st234" d="M32.641,55.42c0-3.558-2.885-6.442-6.444-6.442"/><path class="st234" d="M39.394,60.597c3.559,0,6.441-2.885,6.441-6.443"/><line class="st235" x1="62.123" y1="11.047" x2="0.631" y2="61.024"/></g><g id="manifesto-parity" data-size="132x42" class="nanobox-svg ">	<polygon class="st234" points="46.439,11.834 24.665,22.283 2.889,11.834 24.665,1.386 	"/><polyline class="st234" points="46.439,11.834 24.665,22.283 2.889,11.834 	"/><polyline class="st234" points="31.209,28.026 24.665,31.165 2.889,20.717 	"/><line class="st234" x1="39.004" y1="24.285" x2="34.47" y2="26.459"/><line class="st234" x1="46.439" y1="20.717" x2="42.401" y2="22.653"/><polyline class="st234" points="46.439,29.6 24.665,40.047 2.889,29.6 	"/><line class="st236" x1="58.402" y1="18.968" x2="72.959" y2="18.968"/><line class="st236" x1="58.402" y1="24.948" x2="72.959" y2="24.948"/><polygon class="st234" points="128.885,11.834 107.108,22.283 85.335,11.834 107.108,1.386 	"/><polyline class="st234" points="128.885,11.834 107.108,22.283 85.335,11.834 	"/><polyline class="st234" points="113.651,28.026 107.108,31.165 85.335,20.717 	"/><line class="st234" x1="121.45" y1="24.285" x2="116.916" y2="26.459"/><line class="st234" x1="128.885" y1="20.717" x2="124.847" y2="22.653"/><polyline class="st234" points="128.885,29.6 107.108,40.047 85.335,29.6 	"/></g><g id="manifesto-virtualization" data-size="99x54" class="nanobox-svg ">	<g>		<path class="st234" d="M14.939,44.984V3.651c0-1.32,1.081-2.401,2.401-2.401h63.152c1.32,0,2.401,1.081,2.401,2.401v41.333"/></g>	<rect x="26.178" y="10.164" class="st237" width="18.874" height="27.246"/><rect x="50.051" y="10.164" class="st237" width="8.665" height="9.458"/><rect x="50.051" y="24.377" class="st237" width="21.998" height="13.033"/><rect x="63.491" y="10.164" class="st206" width="8.667" height="9.458"/><path class="st234" d="M55.17,40.875"/><path class="st234" d="M37.097,40.875"/><g>		<path class="st234" d="M96.859,50.434c0,1.1-0.9,2-2,2H3.25c-1.1,0-2-0.9-2-2v-1.449c0-1.1,0.9-2,2-2h91.609c1.1,0,2,0.9,2,2			V50.434z"/></g></g><g id="jumper-arrow" data-size="22x17" class="nanobox-svg ">	<line class="st238" x1="0" y1="8.339" x2="20.302" y2="8.339"/><polyline class="st238" points="12.315,0.354 20.302,8.339 12.315,16.325 	"/></g><g id="video-play" data-size="30x30" class="nanobox-svg ">	<circle class="st239" cx="14.762" cy="14.762" r="13.762"/><polygon class="st206" points="11.648,21.115 11.648,9.768 20.75,15.441 	"/></g>';var pxSvgIconString = pxSvgIconString || ''; pxSvgIconString+='';
!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.jade=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

/**
 * Merge two attribute objects giving precedence
 * to values in object `b`. Classes are special-cased
 * allowing for arrays and merging/joining appropriately
 * resulting in a string.
 *
 * @param {Object} a
 * @param {Object} b
 * @return {Object} a
 * @api private
 */

exports.merge = function merge(a, b) {
  if (arguments.length === 1) {
    var attrs = a[0];
    for (var i = 1; i < a.length; i++) {
      attrs = merge(attrs, a[i]);
    }
    return attrs;
  }
  var ac = a['class'];
  var bc = b['class'];

  if (ac || bc) {
    ac = ac || [];
    bc = bc || [];
    if (!Array.isArray(ac)) ac = [ac];
    if (!Array.isArray(bc)) bc = [bc];
    a['class'] = ac.concat(bc).filter(nulls);
  }

  for (var key in b) {
    if (key != 'class') {
      a[key] = b[key];
    }
  }

  return a;
};

/**
 * Filter null `val`s.
 *
 * @param {*} val
 * @return {Boolean}
 * @api private
 */

function nulls(val) {
  return val != null && val !== '';
}

/**
 * join array as classes.
 *
 * @param {*} val
 * @return {String}
 */
exports.joinClasses = joinClasses;
function joinClasses(val) {
  return Array.isArray(val) ? val.map(joinClasses).filter(nulls).join(' ') : val;
}

/**
 * Render the given classes.
 *
 * @param {Array} classes
 * @param {Array.<Boolean>} escaped
 * @return {String}
 */
exports.cls = function cls(classes, escaped) {
  var buf = [];
  for (var i = 0; i < classes.length; i++) {
    if (escaped && escaped[i]) {
      buf.push(exports.escape(joinClasses([classes[i]])));
    } else {
      buf.push(joinClasses(classes[i]));
    }
  }
  var text = joinClasses(buf);
  if (text.length) {
    return ' class="' + text + '"';
  } else {
    return '';
  }
};

/**
 * Render the given attribute.
 *
 * @param {String} key
 * @param {String} val
 * @param {Boolean} escaped
 * @param {Boolean} terse
 * @return {String}
 */
exports.attr = function attr(key, val, escaped, terse) {
  if ('boolean' == typeof val || null == val) {
    if (val) {
      return ' ' + (terse ? key : key + '="' + key + '"');
    } else {
      return '';
    }
  } else if (0 == key.indexOf('data') && 'string' != typeof val) {
    return ' ' + key + "='" + JSON.stringify(val).replace(/'/g, '&apos;') + "'";
  } else if (escaped) {
    return ' ' + key + '="' + exports.escape(val) + '"';
  } else {
    return ' ' + key + '="' + val + '"';
  }
};

/**
 * Render the given attributes object.
 *
 * @param {Object} obj
 * @param {Object} escaped
 * @return {String}
 */
exports.attrs = function attrs(obj, terse){
  var buf = [];

  var keys = Object.keys(obj);

  if (keys.length) {
    for (var i = 0; i < keys.length; ++i) {
      var key = keys[i]
        , val = obj[key];

      if ('class' == key) {
        if (val = joinClasses(val)) {
          buf.push(' ' + key + '="' + val + '"');
        }
      } else {
        buf.push(exports.attr(key, val, false, terse));
      }
    }
  }

  return buf.join('');
};

/**
 * Escape the given string of `html`.
 *
 * @param {String} html
 * @return {String}
 * @api private
 */

exports.escape = function escape(html){
  var result = String(html)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  if (result === '' + html) return html;
  else return result;
};

/**
 * Re-throw the given `err` in context to the
 * the jade in `filename` at the given `lineno`.
 *
 * @param {Error} err
 * @param {String} filename
 * @param {String} lineno
 * @api private
 */

exports.rethrow = function rethrow(err, filename, lineno, str){
  if (!(err instanceof Error)) throw err;
  if ((typeof window != 'undefined' || !filename) && !str) {
    err.message += ' on line ' + lineno;
    throw err;
  }
  try {
    str = str || require('fs').readFileSync(filename, 'utf8')
  } catch (ex) {
    rethrow(err, null, lineno)
  }
  var context = 3
    , lines = str.split('\n')
    , start = Math.max(lineno - context, 0)
    , end = Math.min(lines.length, lineno + context);

  // Error context
  var context = lines.slice(start, end).map(function(line, i){
    var curr = i + start + 1;
    return (curr == lineno ? '  > ' : '    ')
      + curr
      + '| '
      + line;
  }).join('\n');

  // Alter exception message
  err.path = filename;
  err.message = (filename || 'Jade') + ':' + lineno
    + '\n' + context + '\n\n' + err.message;
  throw err;
};

},{"fs":2}],2:[function(require,module,exports){

},{}]},{},[1])(1)
});
var ShadowIcons, castShadows, pxicons, shadowIcons,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

ShadowIcons = (function() {
  function ShadowIcons() {
    this.svgReplaceWithString = __bind(this.svgReplaceWithString, this);
    window.shadowIconsInstance = this;
  }

  ShadowIcons.prototype.svgReplaceWithString = function($jqueryContext, svgString) {
    if (svgString == null) {
      svgString = pxSvgIconString;
    }
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
    var $svg, image, images, _i, _len, _results;
    $svg = $(this.buildSvg(svg, "main"));
    images = $("img.shadow-icon", $jqueryContext);
    _results = [];
    for (_i = 0, _len = images.length; _i < _len; _i++) {
      image = images[_i];
      _results.push(this.createSvg(image, $svg));
    }
    return _results;
  };

  ShadowIcons.prototype.createSvg = function(image, $svg) {
    var $g, $holder, $targetSvg, id, lockToMax, modBox, newNode, rawHtml, scalable, serializer, size, usesSymbols, _ref, _ref1, _ref2, _ref3;
    id = $(image).attr("data-src");
    scalable = ((_ref = $(image).attr("scalable")) != null ? _ref.toUpperCase() : void 0) === 'TRUE';
    lockToMax = ((_ref1 = $(image).attr("lock-to-max")) != null ? _ref1.toUpperCase() : void 0) === 'TRUE';
    lockToMax || (lockToMax = ((_ref2 = $(image).attr("data-lock-to-max")) != null ? _ref2.toUpperCase() : void 0) === 'TRUE');
    scalable || (scalable = ((_ref3 = $(image).attr("data-scalable")) != null ? _ref3.toUpperCase() : void 0) === 'TRUE');
    $g = $("#" + id, $svg);
    if ($g[0] == null) {
      console.log("Shadow Icons : Tried to add an SVG with the id '" + id + "', but an SVG with id doesn't exist in the library SVG.");
      return;
    } else if ($g.attr("data-size") == null) {
      console.log("Unable to find the size attribute on '" + id + "'");
      return;
    }
    size = $g.attr("data-size").split('x');
    modBox = {
      width: size[0],
      height: size[1]
    };
    $targetSvg = $g[0];
    usesSymbols = false;
    serializer = new XMLSerializer();
    rawHtml = serializer.serializeToString($targetSvg);
    if (usesSymbols) {
      newNode = $(this.buildSvg(rawHtml, id, pxSymbolString));
    } else {
      newNode = $(this.buildSvg(rawHtml, id));
    }
    $('body').append(newNode);
    if (scalable) {
      newNode.get(0).setAttribute("viewBox", "0 0 " + modBox.width + " " + modBox.height);
      $holder = $("<div class='holder'><div>");
      $holder.css({
        "width": "100%",
        "display": "inline-block"
      });
      if (lockToMax) {
        $holder.css({
          "max-width": "" + modBox.width + "px",
          "max-height": "" + modBox.height + "px"
        });
      }
      $holder.append(newNode);
      return $(image).replaceWith($holder);
    } else {
      newNode.attr({
        width: "" + modBox.width + "px",
        height: "" + modBox.height + "px"
      });
      return $(image).replaceWith(newNode);
    }
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

shadowIcons = new pxicons.ShadowIcons();

castShadows = shadowIcons.svgReplaceWithString;

/*!
 * jQuery JavaScript Library v2.1.4
 * http://jquery.com/
 *
 * Includes Sizzle.js
 * http://sizzlejs.com/
 *
 * Copyright 2005, 2014 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2015-04-28T16:01Z
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

	version = "2.1.4",

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

	// Support: iOS 8.2 (not reproducible in simulator)
	// `in` check used to prevent JIT error (gh-2145)
	// hasOwn isn't used here due to false negatives
	// regarding Nodelist length in IE
	var length = "length" in obj && obj.length,
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

localJadeTemplates = {};
localJadeTemplates['community'] = function template(locals) {
var buf = [];
var jade_mixins = {};
var jade_interp;

;return buf.join("");
};

localJadeTemplates['demo-video'] = function template(locals) {
var buf = [];
var jade_mixins = {};
var jade_interp;

buf.push("<div class=\"modal-overlay\"><div class=\"close-video-modal\"><img data-src=\"close-btn\" class=\"shadow-icon\"/></div><iframe width=\"840\" height=\"473\" src=\"https://www.youtube.com/embed/TV4iBxytfyE?autoplay=1\" frameborder=\"0\" allowfullscreen=\"allowfullscreen\"></iframe></div>");;return buf.join("");
};

localJadeTemplates['download-list-link'] = function template(locals) {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (os, version, stability) {
buf.push("<li" + (jade.attr("os", "" + (os) + "", true, false)) + (jade.attr("release", "" + (version) + "", true, false)) + ">" + (jade.escape((jade_interp = version) == null ? '' : jade_interp)) + "\t<span>" + (jade.escape((jade_interp = stability) == null ? '' : jade_interp)) + "</span></li>");}.call(this,"os" in locals_for_with?locals_for_with.os:typeof os!=="undefined"?os:undefined,"version" in locals_for_with?locals_for_with.version:typeof version!=="undefined"?version:undefined,"stability" in locals_for_with?locals_for_with.stability:typeof stability!=="undefined"?stability:undefined));;return buf.join("");
};

/*! VelocityJS.org (1.2.2). (C) 2014 Julian Shapiro. MIT @license: en.wikipedia.org/wiki/MIT_License */

/*************************
   Velocity jQuery Shim
*************************/

/*! VelocityJS.org jQuery Shim (1.0.1). (C) 2014 The jQuery Foundation. MIT @license: en.wikipedia.org/wiki/MIT_License. */

/* This file contains the jQuery functions that Velocity relies on, thereby removing Velocity's dependency on a full copy of jQuery, and allowing it to work in any environment. */
/* These shimmed functions are only used if jQuery isn't present. If both this shim and jQuery are loaded, Velocity defaults to jQuery proper. */
/* Browser support: Using this shim instead of jQuery proper removes support for IE8. */

;(function (window) {
    /***************
         Setup
    ***************/

    /* If jQuery is already loaded, there's no point in loading this shim. */
    if (window.jQuery) {
        return;
    }

    /* jQuery base. */
    var $ = function (selector, context) {
        return new $.fn.init(selector, context);
    };

    /********************
       Private Methods
    ********************/

    /* jQuery */
    $.isWindow = function (obj) {
        /* jshint eqeqeq: false */
        return obj != null && obj == obj.window;
    };

    /* jQuery */
    $.type = function (obj) {
        if (obj == null) {
            return obj + "";
        }

        return typeof obj === "object" || typeof obj === "function" ?
            class2type[toString.call(obj)] || "object" :
            typeof obj;
    };

    /* jQuery */
    $.isArray = Array.isArray || function (obj) {
        return $.type(obj) === "array";
    };

    /* jQuery */
    function isArraylike (obj) {
        var length = obj.length,
            type = $.type(obj);

        if (type === "function" || $.isWindow(obj)) {
            return false;
        }

        if (obj.nodeType === 1 && length) {
            return true;
        }

        return type === "array" || length === 0 || typeof length === "number" && length > 0 && (length - 1) in obj;
    }

    /***************
       $ Methods
    ***************/

    /* jQuery: Support removed for IE<9. */
    $.isPlainObject = function (obj) {
        var key;

        if (!obj || $.type(obj) !== "object" || obj.nodeType || $.isWindow(obj)) {
            return false;
        }

        try {
            if (obj.constructor &&
                !hasOwn.call(obj, "constructor") &&
                !hasOwn.call(obj.constructor.prototype, "isPrototypeOf")) {
                return false;
            }
        } catch (e) {
            return false;
        }

        for (key in obj) {}

        return key === undefined || hasOwn.call(obj, key);
    };

    /* jQuery */
    $.each = function(obj, callback, args) {
        var value,
            i = 0,
            length = obj.length,
            isArray = isArraylike(obj);

        if (args) {
            if (isArray) {
                for (; i < length; i++) {
                    value = callback.apply(obj[i], args);

                    if (value === false) {
                        break;
                    }
                }
            } else {
                for (i in obj) {
                    value = callback.apply(obj[i], args);

                    if (value === false) {
                        break;
                    }
                }
            }

        } else {
            if (isArray) {
                for (; i < length; i++) {
                    value = callback.call(obj[i], i, obj[i]);

                    if (value === false) {
                        break;
                    }
                }
            } else {
                for (i in obj) {
                    value = callback.call(obj[i], i, obj[i]);

                    if (value === false) {
                        break;
                    }
                }
            }
        }

        return obj;
    };

    /* Custom */
    $.data = function (node, key, value) {
        /* $.getData() */
        if (value === undefined) {
            var id = node[$.expando],
                store = id && cache[id];

            if (key === undefined) {
                return store;
            } else if (store) {
                if (key in store) {
                    return store[key];
                }
            }
        /* $.setData() */
        } else if (key !== undefined) {
            var id = node[$.expando] || (node[$.expando] = ++$.uuid);

            cache[id] = cache[id] || {};
            cache[id][key] = value;

            return value;
        }
    };

    /* Custom */
    $.removeData = function (node, keys) {
        var id = node[$.expando],
            store = id && cache[id];

        if (store) {
            $.each(keys, function(_, key) {
                delete store[key];
            });
        }
    };

    /* jQuery */
    $.extend = function () {
        var src, copyIsArray, copy, name, options, clone,
            target = arguments[0] || {},
            i = 1,
            length = arguments.length,
            deep = false;

        if (typeof target === "boolean") {
            deep = target;

            target = arguments[i] || {};
            i++;
        }

        if (typeof target !== "object" && $.type(target) !== "function") {
            target = {};
        }

        if (i === length) {
            target = this;
            i--;
        }

        for (; i < length; i++) {
            if ((options = arguments[i]) != null) {
                for (name in options) {
                    src = target[name];
                    copy = options[name];

                    if (target === copy) {
                        continue;
                    }

                    if (deep && copy && ($.isPlainObject(copy) || (copyIsArray = $.isArray(copy)))) {
                        if (copyIsArray) {
                            copyIsArray = false;
                            clone = src && $.isArray(src) ? src : [];

                        } else {
                            clone = src && $.isPlainObject(src) ? src : {};
                        }

                        target[name] = $.extend(deep, clone, copy);

                    } else if (copy !== undefined) {
                        target[name] = copy;
                    }
                }
            }
        }

        return target;
    };

    /* jQuery 1.4.3 */
    $.queue = function (elem, type, data) {
        function $makeArray (arr, results) {
            var ret = results || [];

            if (arr != null) {
                if (isArraylike(Object(arr))) {
                    /* $.merge */
                    (function(first, second) {
                        var len = +second.length,
                            j = 0,
                            i = first.length;

                        while (j < len) {
                            first[i++] = second[j++];
                        }

                        if (len !== len) {
                            while (second[j] !== undefined) {
                                first[i++] = second[j++];
                            }
                        }

                        first.length = i;

                        return first;
                    })(ret, typeof arr === "string" ? [arr] : arr);
                } else {
                    [].push.call(ret, arr);
                }
            }

            return ret;
        }

        if (!elem) {
            return;
        }

        type = (type || "fx") + "queue";

        var q = $.data(elem, type);

        if (!data) {
            return q || [];
        }

        if (!q || $.isArray(data)) {
            q = $.data(elem, type, $makeArray(data));
        } else {
            q.push(data);
        }

        return q;
    };

    /* jQuery 1.4.3 */
    $.dequeue = function (elems, type) {
        /* Custom: Embed element iteration. */
        $.each(elems.nodeType ? [ elems ] : elems, function(i, elem) {
            type = type || "fx";

            var queue = $.queue(elem, type),
                fn = queue.shift();

            if (fn === "inprogress") {
                fn = queue.shift();
            }

            if (fn) {
                if (type === "fx") {
                    queue.unshift("inprogress");
                }

                fn.call(elem, function() {
                    $.dequeue(elem, type);
                });
            }
        });
    };

    /******************
       $.fn Methods
    ******************/

    /* jQuery */
    $.fn = $.prototype = {
        init: function (selector) {
            /* Just return the element wrapped inside an array; don't proceed with the actual jQuery node wrapping process. */
            if (selector.nodeType) {
                this[0] = selector;

                return this;
            } else {
                throw new Error("Not a DOM node.");
            }
        },

        offset: function () {
            /* jQuery altered code: Dropped disconnected DOM node checking. */
            var box = this[0].getBoundingClientRect ? this[0].getBoundingClientRect() : { top: 0, left: 0 };

            return {
                top: box.top + (window.pageYOffset || document.scrollTop  || 0)  - (document.clientTop  || 0),
                left: box.left + (window.pageXOffset || document.scrollLeft  || 0) - (document.clientLeft || 0)
            };
        },

        position: function () {
            /* jQuery */
            function offsetParent() {
                var offsetParent = this.offsetParent || document;

                while (offsetParent && (!offsetParent.nodeType.toLowerCase === "html" && offsetParent.style.position === "static")) {
                    offsetParent = offsetParent.offsetParent;
                }

                return offsetParent || document;
            }

            /* Zepto */
            var elem = this[0],
                offsetParent = offsetParent.apply(elem),
                offset = this.offset(),
                parentOffset = /^(?:body|html)$/i.test(offsetParent.nodeName) ? { top: 0, left: 0 } : $(offsetParent).offset()

            offset.top -= parseFloat(elem.style.marginTop) || 0;
            offset.left -= parseFloat(elem.style.marginLeft) || 0;

            if (offsetParent.style) {
                parentOffset.top += parseFloat(offsetParent.style.borderTopWidth) || 0
                parentOffset.left += parseFloat(offsetParent.style.borderLeftWidth) || 0
            }

            return {
                top: offset.top - parentOffset.top,
                left: offset.left - parentOffset.left
            };
        }
    };

    /**********************
       Private Variables
    **********************/

    /* For $.data() */
    var cache = {};
    $.expando = "velocity" + (new Date().getTime());
    $.uuid = 0;

    /* For $.queue() */
    var class2type = {},
        hasOwn = class2type.hasOwnProperty,
        toString = class2type.toString;

    var types = "Boolean Number String Function Array Date RegExp Object Error".split(" ");
    for (var i = 0; i < types.length; i++) {
        class2type["[object " + types[i] + "]"] = types[i].toLowerCase();
    }

    /* Makes $(node) possible, without having to call init. */
    $.fn.init.prototype = $.fn;

    /* Globalize Velocity onto the window, and assign its Utilities property. */
    window.Velocity = { Utilities: $ };
})(window);

/******************
    Velocity.js
******************/

;(function (factory) {
    /* CommonJS module. */
    if (typeof module === "object" && typeof module.exports === "object") {
        module.exports = factory();
    /* AMD module. */
    } else if (typeof define === "function" && define.amd) {
        define(factory);
    /* Browser globals. */
    } else {
        factory();
    }
}(function() {
return function (global, window, document, undefined) {

    /***************
        Summary
    ***************/

    /*
    - CSS: CSS stack that works independently from the rest of Velocity.
    - animate(): Core animation method that iterates over the targeted elements and queues the incoming call onto each element individually.
      - Pre-Queueing: Prepare the element for animation by instantiating its data cache and processing the call's options.
      - Queueing: The logic that runs once the call has reached its point of execution in the element's $.queue() stack.
                  Most logic is placed here to avoid risking it becoming stale (if the element's properties have changed).
      - Pushing: Consolidation of the tween data followed by its push onto the global in-progress calls container.
    - tick(): The single requestAnimationFrame loop responsible for tweening all in-progress calls.
    - completeCall(): Handles the cleanup process for each Velocity call.
    */

    /*********************
       Helper Functions
    *********************/

    /* IE detection. Gist: https://gist.github.com/julianshapiro/9098609 */
    var IE = (function() {
        if (document.documentMode) {
            return document.documentMode;
        } else {
            for (var i = 7; i > 4; i--) {
                var div = document.createElement("div");

                div.innerHTML = "<!--[if IE " + i + "]><span></span><![endif]-->";

                if (div.getElementsByTagName("span").length) {
                    div = null;

                    return i;
                }
            }
        }

        return undefined;
    })();

    /* rAF shim. Gist: https://gist.github.com/julianshapiro/9497513 */
    var rAFShim = (function() {
        var timeLast = 0;

        return window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || function(callback) {
            var timeCurrent = (new Date()).getTime(),
                timeDelta;

            /* Dynamically set delay on a per-tick basis to match 60fps. */
            /* Technique by Erik Moller. MIT license: https://gist.github.com/paulirish/1579671 */
            timeDelta = Math.max(0, 16 - (timeCurrent - timeLast));
            timeLast = timeCurrent + timeDelta;

            return setTimeout(function() { callback(timeCurrent + timeDelta); }, timeDelta);
        };
    })();

    /* Array compacting. Copyright Lo-Dash. MIT License: https://github.com/lodash/lodash/blob/master/LICENSE.txt */
    function compactSparseArray (array) {
        var index = -1,
            length = array ? array.length : 0,
            result = [];

        while (++index < length) {
            var value = array[index];

            if (value) {
                result.push(value);
            }
        }

        return result;
    }

    function sanitizeElements (elements) {
        /* Unwrap jQuery/Zepto objects. */
        if (Type.isWrapped(elements)) {
            elements = [].slice.call(elements);
        /* Wrap a single element in an array so that $.each() can iterate with the element instead of its node's children. */
        } else if (Type.isNode(elements)) {
            elements = [ elements ];
        }

        return elements;
    }

    var Type = {
        isString: function (variable) {
            return (typeof variable === "string");
        },
        isArray: Array.isArray || function (variable) {
            return Object.prototype.toString.call(variable) === "[object Array]";
        },
        isFunction: function (variable) {
            return Object.prototype.toString.call(variable) === "[object Function]";
        },
        isNode: function (variable) {
            return variable && variable.nodeType;
        },
        /* Copyright Martin Bohm. MIT License: https://gist.github.com/Tomalak/818a78a226a0738eaade */
        isNodeList: function (variable) {
            return typeof variable === "object" &&
                /^\[object (HTMLCollection|NodeList|Object)\]$/.test(Object.prototype.toString.call(variable)) &&
                variable.length !== undefined &&
                (variable.length === 0 || (typeof variable[0] === "object" && variable[0].nodeType > 0));
        },
        /* Determine if variable is a wrapped jQuery or Zepto element. */
        isWrapped: function (variable) {
            return variable && (variable.jquery || (window.Zepto && window.Zepto.zepto.isZ(variable)));
        },
        isSVG: function (variable) {
            return window.SVGElement && (variable instanceof window.SVGElement);
        },
        isEmptyObject: function (variable) {
            for (var name in variable) {
                return false;
            }

            return true;
        }
    };

    /*****************
       Dependencies
    *****************/

    var $,
        isJQuery = false;

    if (global.fn && global.fn.jquery) {
        $ = global;
        isJQuery = true;
    } else {
        $ = window.Velocity.Utilities;
    }

    if (IE <= 8 && !isJQuery) {
        throw new Error("Velocity: IE8 and below require jQuery to be loaded before Velocity.");
    } else if (IE <= 7) {
        /* Revert to jQuery's $.animate(), and lose Velocity's extra features. */
        jQuery.fn.velocity = jQuery.fn.animate;

        /* Now that $.fn.velocity is aliased, abort this Velocity declaration. */
        return;
    }

    /*****************
        Constants
    *****************/

    var DURATION_DEFAULT = 400,
        EASING_DEFAULT = "swing";

    /*************
        State
    *************/

    var Velocity = {
        /* Container for page-wide Velocity state data. */
        State: {
            /* Detect mobile devices to determine if mobileHA should be turned on. */
            isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
            /* The mobileHA option's behavior changes on older Android devices (Gingerbread, versions 2.3.3-2.3.7). */
            isAndroid: /Android/i.test(navigator.userAgent),
            isGingerbread: /Android 2\.3\.[3-7]/i.test(navigator.userAgent),
            isChrome: window.chrome,
            isFirefox: /Firefox/i.test(navigator.userAgent),
            /* Create a cached element for re-use when checking for CSS property prefixes. */
            prefixElement: document.createElement("div"),
            /* Cache every prefix match to avoid repeating lookups. */
            prefixMatches: {},
            /* Cache the anchor used for animating window scrolling. */
            scrollAnchor: null,
            /* Cache the browser-specific property names associated with the scroll anchor. */
            scrollPropertyLeft: null,
            scrollPropertyTop: null,
            /* Keep track of whether our RAF tick is running. */
            isTicking: false,
            /* Container for every in-progress call to Velocity. */
            calls: []
        },
        /* Velocity's custom CSS stack. Made global for unit testing. */
        CSS: { /* Defined below. */ },
        /* A shim of the jQuery utility functions used by Velocity -- provided by Velocity's optional jQuery shim. */
        Utilities: $,
        /* Container for the user's custom animation redirects that are referenced by name in place of the properties map argument. */
        Redirects: { /* Manually registered by the user. */ },
        Easings: { /* Defined below. */ },
        /* Attempt to use ES6 Promises by default. Users can override this with a third-party promises library. */
        Promise: window.Promise,
        /* Velocity option defaults, which can be overriden by the user. */
        defaults: {
            queue: "",
            duration: DURATION_DEFAULT,
            easing: EASING_DEFAULT,
            begin: undefined,
            complete: undefined,
            progress: undefined,
            display: undefined,
            visibility: undefined,
            loop: false,
            delay: false,
            mobileHA: true,
            /* Advanced: Set to false to prevent property values from being cached between consecutive Velocity-initiated chain calls. */
            _cacheValues: true
        },
        /* A design goal of Velocity is to cache data wherever possible in order to avoid DOM requerying. Accordingly, each element has a data cache. */
        init: function (element) {
            $.data(element, "velocity", {
                /* Store whether this is an SVG element, since its properties are retrieved and updated differently than standard HTML elements. */
                isSVG: Type.isSVG(element),
                /* Keep track of whether the element is currently being animated by Velocity.
                   This is used to ensure that property values are not transferred between non-consecutive (stale) calls. */
                isAnimating: false,
                /* A reference to the element's live computedStyle object. Learn more here: https://developer.mozilla.org/en/docs/Web/API/window.getComputedStyle */
                computedStyle: null,
                /* Tween data is cached for each animation on the element so that data can be passed across calls --
                   in particular, end values are used as subsequent start values in consecutive Velocity calls. */
                tweensContainer: null,
                /* The full root property values of each CSS hook being animated on this element are cached so that:
                   1) Concurrently-animating hooks sharing the same root can have their root values' merged into one while tweening.
                   2) Post-hook-injection root values can be transferred over to consecutively chained Velocity calls as starting root values. */
                rootPropertyValueCache: {},
                /* A cache for transform updates, which must be manually flushed via CSS.flushTransformCache(). */
                transformCache: {}
            });
        },
        /* A parallel to jQuery's $.css(), used for getting/setting Velocity's hooked CSS properties. */
        hook: null, /* Defined below. */
        /* Velocity-wide animation time remapping for testing purposes. */
        mock: false,
        version: { major: 1, minor: 2, patch: 2 },
        /* Set to 1 or 2 (most verbose) to output debug info to console. */
        debug: false
    };

    /* Retrieve the appropriate scroll anchor and property name for the browser: https://developer.mozilla.org/en-US/docs/Web/API/Window.scrollY */
    if (window.pageYOffset !== undefined) {
        Velocity.State.scrollAnchor = window;
        Velocity.State.scrollPropertyLeft = "pageXOffset";
        Velocity.State.scrollPropertyTop = "pageYOffset";
    } else {
        Velocity.State.scrollAnchor = document.documentElement || document.body.parentNode || document.body;
        Velocity.State.scrollPropertyLeft = "scrollLeft";
        Velocity.State.scrollPropertyTop = "scrollTop";
    }

    /* Shorthand alias for jQuery's $.data() utility. */
    function Data (element) {
        /* Hardcode a reference to the plugin name. */
        var response = $.data(element, "velocity");

        /* jQuery <=1.4.2 returns null instead of undefined when no match is found. We normalize this behavior. */
        return response === null ? undefined : response;
    };

    /**************
        Easing
    **************/

    /* Step easing generator. */
    function generateStep (steps) {
        return function (p) {
            return Math.round(p * steps) * (1 / steps);
        };
    }

    /* Bezier curve function generator. Copyright Gaetan Renaudeau. MIT License: http://en.wikipedia.org/wiki/MIT_License */
    function generateBezier (mX1, mY1, mX2, mY2) {
        var NEWTON_ITERATIONS = 4,
            NEWTON_MIN_SLOPE = 0.001,
            SUBDIVISION_PRECISION = 0.0000001,
            SUBDIVISION_MAX_ITERATIONS = 10,
            kSplineTableSize = 11,
            kSampleStepSize = 1.0 / (kSplineTableSize - 1.0),
            float32ArraySupported = "Float32Array" in window;

        /* Must contain four arguments. */
        if (arguments.length !== 4) {
            return false;
        }

        /* Arguments must be numbers. */
        for (var i = 0; i < 4; ++i) {
            if (typeof arguments[i] !== "number" || isNaN(arguments[i]) || !isFinite(arguments[i])) {
                return false;
            }
        }

        /* X values must be in the [0, 1] range. */
        mX1 = Math.min(mX1, 1);
        mX2 = Math.min(mX2, 1);
        mX1 = Math.max(mX1, 0);
        mX2 = Math.max(mX2, 0);

        var mSampleValues = float32ArraySupported ? new Float32Array(kSplineTableSize) : new Array(kSplineTableSize);

        function A (aA1, aA2) { return 1.0 - 3.0 * aA2 + 3.0 * aA1; }
        function B (aA1, aA2) { return 3.0 * aA2 - 6.0 * aA1; }
        function C (aA1)      { return 3.0 * aA1; }

        function calcBezier (aT, aA1, aA2) {
            return ((A(aA1, aA2)*aT + B(aA1, aA2))*aT + C(aA1))*aT;
        }

        function getSlope (aT, aA1, aA2) {
            return 3.0 * A(aA1, aA2)*aT*aT + 2.0 * B(aA1, aA2) * aT + C(aA1);
        }

        function newtonRaphsonIterate (aX, aGuessT) {
            for (var i = 0; i < NEWTON_ITERATIONS; ++i) {
                var currentSlope = getSlope(aGuessT, mX1, mX2);

                if (currentSlope === 0.0) return aGuessT;

                var currentX = calcBezier(aGuessT, mX1, mX2) - aX;
                aGuessT -= currentX / currentSlope;
            }

            return aGuessT;
        }

        function calcSampleValues () {
            for (var i = 0; i < kSplineTableSize; ++i) {
                mSampleValues[i] = calcBezier(i * kSampleStepSize, mX1, mX2);
            }
        }

        function binarySubdivide (aX, aA, aB) {
            var currentX, currentT, i = 0;

            do {
                currentT = aA + (aB - aA) / 2.0;
                currentX = calcBezier(currentT, mX1, mX2) - aX;
                if (currentX > 0.0) {
                  aB = currentT;
                } else {
                  aA = currentT;
                }
            } while (Math.abs(currentX) > SUBDIVISION_PRECISION && ++i < SUBDIVISION_MAX_ITERATIONS);

            return currentT;
        }

        function getTForX (aX) {
            var intervalStart = 0.0,
                currentSample = 1,
                lastSample = kSplineTableSize - 1;

            for (; currentSample != lastSample && mSampleValues[currentSample] <= aX; ++currentSample) {
                intervalStart += kSampleStepSize;
            }

            --currentSample;

            var dist = (aX - mSampleValues[currentSample]) / (mSampleValues[currentSample+1] - mSampleValues[currentSample]),
                guessForT = intervalStart + dist * kSampleStepSize,
                initialSlope = getSlope(guessForT, mX1, mX2);

            if (initialSlope >= NEWTON_MIN_SLOPE) {
                return newtonRaphsonIterate(aX, guessForT);
            } else if (initialSlope == 0.0) {
                return guessForT;
            } else {
                return binarySubdivide(aX, intervalStart, intervalStart + kSampleStepSize);
            }
        }

        var _precomputed = false;

        function precompute() {
            _precomputed = true;
            if (mX1 != mY1 || mX2 != mY2) calcSampleValues();
        }

        var f = function (aX) {
            if (!_precomputed) precompute();
            if (mX1 === mY1 && mX2 === mY2) return aX;
            if (aX === 0) return 0;
            if (aX === 1) return 1;

            return calcBezier(getTForX(aX), mY1, mY2);
        };

        f.getControlPoints = function() { return [{ x: mX1, y: mY1 }, { x: mX2, y: mY2 }]; };

        var str = "generateBezier(" + [mX1, mY1, mX2, mY2] + ")";
        f.toString = function () { return str; };

        return f;
    }

    /* Runge-Kutta spring physics function generator. Adapted from Framer.js, copyright Koen Bok. MIT License: http://en.wikipedia.org/wiki/MIT_License */
    /* Given a tension, friction, and duration, a simulation at 60FPS will first run without a defined duration in order to calculate the full path. A second pass
       then adjusts the time delta -- using the relation between actual time and duration -- to calculate the path for the duration-constrained animation. */
    var generateSpringRK4 = (function () {
        function springAccelerationForState (state) {
            return (-state.tension * state.x) - (state.friction * state.v);
        }

        function springEvaluateStateWithDerivative (initialState, dt, derivative) {
            var state = {
                x: initialState.x + derivative.dx * dt,
                v: initialState.v + derivative.dv * dt,
                tension: initialState.tension,
                friction: initialState.friction
            };

            return { dx: state.v, dv: springAccelerationForState(state) };
        }

        function springIntegrateState (state, dt) {
            var a = {
                    dx: state.v,
                    dv: springAccelerationForState(state)
                },
                b = springEvaluateStateWithDerivative(state, dt * 0.5, a),
                c = springEvaluateStateWithDerivative(state, dt * 0.5, b),
                d = springEvaluateStateWithDerivative(state, dt, c),
                dxdt = 1.0 / 6.0 * (a.dx + 2.0 * (b.dx + c.dx) + d.dx),
                dvdt = 1.0 / 6.0 * (a.dv + 2.0 * (b.dv + c.dv) + d.dv);

            state.x = state.x + dxdt * dt;
            state.v = state.v + dvdt * dt;

            return state;
        }

        return function springRK4Factory (tension, friction, duration) {

            var initState = {
                    x: -1,
                    v: 0,
                    tension: null,
                    friction: null
                },
                path = [0],
                time_lapsed = 0,
                tolerance = 1 / 10000,
                DT = 16 / 1000,
                have_duration, dt, last_state;

            tension = parseFloat(tension) || 500;
            friction = parseFloat(friction) || 20;
            duration = duration || null;

            initState.tension = tension;
            initState.friction = friction;

            have_duration = duration !== null;

            /* Calculate the actual time it takes for this animation to complete with the provided conditions. */
            if (have_duration) {
                /* Run the simulation without a duration. */
                time_lapsed = springRK4Factory(tension, friction);
                /* Compute the adjusted time delta. */
                dt = time_lapsed / duration * DT;
            } else {
                dt = DT;
            }

            while (true) {
                /* Next/step function .*/
                last_state = springIntegrateState(last_state || initState, dt);
                /* Store the position. */
                path.push(1 + last_state.x);
                time_lapsed += 16;
                /* If the change threshold is reached, break. */
                if (!(Math.abs(last_state.x) > tolerance && Math.abs(last_state.v) > tolerance)) {
                    break;
                }
            }

            /* If duration is not defined, return the actual time required for completing this animation. Otherwise, return a closure that holds the
               computed path and returns a snapshot of the position according to a given percentComplete. */
            return !have_duration ? time_lapsed : function(percentComplete) { return path[ (percentComplete * (path.length - 1)) | 0 ]; };
        };
    }());

    /* jQuery easings. */
    Velocity.Easings = {
        linear: function(p) { return p; },
        swing: function(p) { return 0.5 - Math.cos( p * Math.PI ) / 2 },
        /* Bonus "spring" easing, which is a less exaggerated version of easeInOutElastic. */
        spring: function(p) { return 1 - (Math.cos(p * 4.5 * Math.PI) * Math.exp(-p * 6)); }
    };

    /* CSS3 and Robert Penner easings. */
    $.each(
        [
            [ "ease", [ 0.25, 0.1, 0.25, 1.0 ] ],
            [ "ease-in", [ 0.42, 0.0, 1.00, 1.0 ] ],
            [ "ease-out", [ 0.00, 0.0, 0.58, 1.0 ] ],
            [ "ease-in-out", [ 0.42, 0.0, 0.58, 1.0 ] ],
            [ "easeInSine", [ 0.47, 0, 0.745, 0.715 ] ],
            [ "easeOutSine", [ 0.39, 0.575, 0.565, 1 ] ],
            [ "easeInOutSine", [ 0.445, 0.05, 0.55, 0.95 ] ],
            [ "easeInQuad", [ 0.55, 0.085, 0.68, 0.53 ] ],
            [ "easeOutQuad", [ 0.25, 0.46, 0.45, 0.94 ] ],
            [ "easeInOutQuad", [ 0.455, 0.03, 0.515, 0.955 ] ],
            [ "easeInCubic", [ 0.55, 0.055, 0.675, 0.19 ] ],
            [ "easeOutCubic", [ 0.215, 0.61, 0.355, 1 ] ],
            [ "easeInOutCubic", [ 0.645, 0.045, 0.355, 1 ] ],
            [ "easeInQuart", [ 0.895, 0.03, 0.685, 0.22 ] ],
            [ "easeOutQuart", [ 0.165, 0.84, 0.44, 1 ] ],
            [ "easeInOutQuart", [ 0.77, 0, 0.175, 1 ] ],
            [ "easeInQuint", [ 0.755, 0.05, 0.855, 0.06 ] ],
            [ "easeOutQuint", [ 0.23, 1, 0.32, 1 ] ],
            [ "easeInOutQuint", [ 0.86, 0, 0.07, 1 ] ],
            [ "easeInExpo", [ 0.95, 0.05, 0.795, 0.035 ] ],
            [ "easeOutExpo", [ 0.19, 1, 0.22, 1 ] ],
            [ "easeInOutExpo", [ 1, 0, 0, 1 ] ],
            [ "easeInCirc", [ 0.6, 0.04, 0.98, 0.335 ] ],
            [ "easeOutCirc", [ 0.075, 0.82, 0.165, 1 ] ],
            [ "easeInOutCirc", [ 0.785, 0.135, 0.15, 0.86 ] ]
        ], function(i, easingArray) {
            Velocity.Easings[easingArray[0]] = generateBezier.apply(null, easingArray[1]);
        });

    /* Determine the appropriate easing type given an easing input. */
    function getEasing(value, duration) {
        var easing = value;

        /* The easing option can either be a string that references a pre-registered easing,
           or it can be a two-/four-item array of integers to be converted into a bezier/spring function. */
        if (Type.isString(value)) {
            /* Ensure that the easing has been assigned to jQuery's Velocity.Easings object. */
            if (!Velocity.Easings[value]) {
                easing = false;
            }
        } else if (Type.isArray(value) && value.length === 1) {
            easing = generateStep.apply(null, value);
        } else if (Type.isArray(value) && value.length === 2) {
            /* springRK4 must be passed the animation's duration. */
            /* Note: If the springRK4 array contains non-numbers, generateSpringRK4() returns an easing
               function generated with default tension and friction values. */
            easing = generateSpringRK4.apply(null, value.concat([ duration ]));
        } else if (Type.isArray(value) && value.length === 4) {
            /* Note: If the bezier array contains non-numbers, generateBezier() returns false. */
            easing = generateBezier.apply(null, value);
        } else {
            easing = false;
        }

        /* Revert to the Velocity-wide default easing type, or fall back to "swing" (which is also jQuery's default)
           if the Velocity-wide default has been incorrectly modified. */
        if (easing === false) {
            if (Velocity.Easings[Velocity.defaults.easing]) {
                easing = Velocity.defaults.easing;
            } else {
                easing = EASING_DEFAULT;
            }
        }

        return easing;
    }

    /*****************
        CSS Stack
    *****************/

    /* The CSS object is a highly condensed and performant CSS stack that fully replaces jQuery's.
       It handles the validation, getting, and setting of both standard CSS properties and CSS property hooks. */
    /* Note: A "CSS" shorthand is aliased so that our code is easier to read. */
    var CSS = Velocity.CSS = {

        /*************
            RegEx
        *************/

        RegEx: {
            isHex: /^#([A-f\d]{3}){1,2}$/i,
            /* Unwrap a property value's surrounding text, e.g. "rgba(4, 3, 2, 1)" ==> "4, 3, 2, 1" and "rect(4px 3px 2px 1px)" ==> "4px 3px 2px 1px". */
            valueUnwrap: /^[A-z]+\((.*)\)$/i,
            wrappedValueAlreadyExtracted: /[0-9.]+ [0-9.]+ [0-9.]+( [0-9.]+)?/,
            /* Split a multi-value property into an array of subvalues, e.g. "rgba(4, 3, 2, 1) 4px 3px 2px 1px" ==> [ "rgba(4, 3, 2, 1)", "4px", "3px", "2px", "1px" ]. */
            valueSplit: /([A-z]+\(.+\))|(([A-z0-9#-.]+?)(?=\s|$))/ig
        },

        /************
            Lists
        ************/

        Lists: {
            colors: [ "fill", "stroke", "stopColor", "color", "backgroundColor", "borderColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor" ],
            transformsBase: [ "translateX", "translateY", "scale", "scaleX", "scaleY", "skewX", "skewY", "rotateZ" ],
            transforms3D: [ "transformPerspective", "translateZ", "scaleZ", "rotateX", "rotateY" ]
        },

        /************
            Hooks
        ************/

        /* Hooks allow a subproperty (e.g. "boxShadowBlur") of a compound-value CSS property
           (e.g. "boxShadow: X Y Blur Spread Color") to be animated as if it were a discrete property. */
        /* Note: Beyond enabling fine-grained property animation, hooking is necessary since Velocity only
           tweens properties with single numeric values; unlike CSS transitions, Velocity does not interpolate compound-values. */
        Hooks: {
            /********************
                Registration
            ********************/

            /* Templates are a concise way of indicating which subproperties must be individually registered for each compound-value CSS property. */
            /* Each template consists of the compound-value's base name, its constituent subproperty names, and those subproperties' default values. */
            templates: {
                "textShadow": [ "Color X Y Blur", "black 0px 0px 0px" ],
                "boxShadow": [ "Color X Y Blur Spread", "black 0px 0px 0px 0px" ],
                "clip": [ "Top Right Bottom Left", "0px 0px 0px 0px" ],
                "backgroundPosition": [ "X Y", "0% 0%" ],
                "transformOrigin": [ "X Y Z", "50% 50% 0px" ],
                "perspectiveOrigin": [ "X Y", "50% 50%" ]
            },

            /* A "registered" hook is one that has been converted from its template form into a live,
               tweenable property. It contains data to associate it with its root property. */
            registered: {
                /* Note: A registered hook looks like this ==> textShadowBlur: [ "textShadow", 3 ],
                   which consists of the subproperty's name, the associated root property's name,
                   and the subproperty's position in the root's value. */
            },
            /* Convert the templates into individual hooks then append them to the registered object above. */
            register: function () {
                /* Color hooks registration: Colors are defaulted to white -- as opposed to black -- since colors that are
                   currently set to "transparent" default to their respective template below when color-animated,
                   and white is typically a closer match to transparent than black is. An exception is made for text ("color"),
                   which is almost always set closer to black than white. */
                for (var i = 0; i < CSS.Lists.colors.length; i++) {
                    var rgbComponents = (CSS.Lists.colors[i] === "color") ? "0 0 0 1" : "255 255 255 1";
                    CSS.Hooks.templates[CSS.Lists.colors[i]] = [ "Red Green Blue Alpha", rgbComponents ];
                }

                var rootProperty,
                    hookTemplate,
                    hookNames;

                /* In IE, color values inside compound-value properties are positioned at the end the value instead of at the beginning.
                   Thus, we re-arrange the templates accordingly. */
                if (IE) {
                    for (rootProperty in CSS.Hooks.templates) {
                        hookTemplate = CSS.Hooks.templates[rootProperty];
                        hookNames = hookTemplate[0].split(" ");

                        var defaultValues = hookTemplate[1].match(CSS.RegEx.valueSplit);

                        if (hookNames[0] === "Color") {
                            /* Reposition both the hook's name and its default value to the end of their respective strings. */
                            hookNames.push(hookNames.shift());
                            defaultValues.push(defaultValues.shift());

                            /* Replace the existing template for the hook's root property. */
                            CSS.Hooks.templates[rootProperty] = [ hookNames.join(" "), defaultValues.join(" ") ];
                        }
                    }
                }

                /* Hook registration. */
                for (rootProperty in CSS.Hooks.templates) {
                    hookTemplate = CSS.Hooks.templates[rootProperty];
                    hookNames = hookTemplate[0].split(" ");

                    for (var i in hookNames) {
                        var fullHookName = rootProperty + hookNames[i],
                            hookPosition = i;

                        /* For each hook, register its full name (e.g. textShadowBlur) with its root property (e.g. textShadow)
                           and the hook's position in its template's default value string. */
                        CSS.Hooks.registered[fullHookName] = [ rootProperty, hookPosition ];
                    }
                }
            },

            /*****************************
               Injection and Extraction
            *****************************/

            /* Look up the root property associated with the hook (e.g. return "textShadow" for "textShadowBlur"). */
            /* Since a hook cannot be set directly (the browser won't recognize it), style updating for hooks is routed through the hook's root property. */
            getRoot: function (property) {
                var hookData = CSS.Hooks.registered[property];

                if (hookData) {
                    return hookData[0];
                } else {
                    /* If there was no hook match, return the property name untouched. */
                    return property;
                }
            },
            /* Convert any rootPropertyValue, null or otherwise, into a space-delimited list of hook values so that
               the targeted hook can be injected or extracted at its standard position. */
            cleanRootPropertyValue: function(rootProperty, rootPropertyValue) {
                /* If the rootPropertyValue is wrapped with "rgb()", "clip()", etc., remove the wrapping to normalize the value before manipulation. */
                if (CSS.RegEx.valueUnwrap.test(rootPropertyValue)) {
                    rootPropertyValue = rootPropertyValue.match(CSS.RegEx.valueUnwrap)[1];
                }

                /* If rootPropertyValue is a CSS null-value (from which there's inherently no hook value to extract),
                   default to the root's default value as defined in CSS.Hooks.templates. */
                /* Note: CSS null-values include "none", "auto", and "transparent". They must be converted into their
                   zero-values (e.g. textShadow: "none" ==> textShadow: "0px 0px 0px black") for hook manipulation to proceed. */
                if (CSS.Values.isCSSNullValue(rootPropertyValue)) {
                    rootPropertyValue = CSS.Hooks.templates[rootProperty][1];
                }

                return rootPropertyValue;
            },
            /* Extracted the hook's value from its root property's value. This is used to get the starting value of an animating hook. */
            extractValue: function (fullHookName, rootPropertyValue) {
                var hookData = CSS.Hooks.registered[fullHookName];

                if (hookData) {
                    var hookRoot = hookData[0],
                        hookPosition = hookData[1];

                    rootPropertyValue = CSS.Hooks.cleanRootPropertyValue(hookRoot, rootPropertyValue);

                    /* Split rootPropertyValue into its constituent hook values then grab the desired hook at its standard position. */
                    return rootPropertyValue.toString().match(CSS.RegEx.valueSplit)[hookPosition];
                } else {
                    /* If the provided fullHookName isn't a registered hook, return the rootPropertyValue that was passed in. */
                    return rootPropertyValue;
                }
            },
            /* Inject the hook's value into its root property's value. This is used to piece back together the root property
               once Velocity has updated one of its individually hooked values through tweening. */
            injectValue: function (fullHookName, hookValue, rootPropertyValue) {
                var hookData = CSS.Hooks.registered[fullHookName];

                if (hookData) {
                    var hookRoot = hookData[0],
                        hookPosition = hookData[1],
                        rootPropertyValueParts,
                        rootPropertyValueUpdated;

                    rootPropertyValue = CSS.Hooks.cleanRootPropertyValue(hookRoot, rootPropertyValue);

                    /* Split rootPropertyValue into its individual hook values, replace the targeted value with hookValue,
                       then reconstruct the rootPropertyValue string. */
                    rootPropertyValueParts = rootPropertyValue.toString().match(CSS.RegEx.valueSplit);
                    rootPropertyValueParts[hookPosition] = hookValue;
                    rootPropertyValueUpdated = rootPropertyValueParts.join(" ");

                    return rootPropertyValueUpdated;
                } else {
                    /* If the provided fullHookName isn't a registered hook, return the rootPropertyValue that was passed in. */
                    return rootPropertyValue;
                }
            }
        },

        /*******************
           Normalizations
        *******************/

        /* Normalizations standardize CSS property manipulation by pollyfilling browser-specific implementations (e.g. opacity)
           and reformatting special properties (e.g. clip, rgba) to look like standard ones. */
        Normalizations: {
            /* Normalizations are passed a normalization target (either the property's name, its extracted value, or its injected value),
               the targeted element (which may need to be queried), and the targeted property value. */
            registered: {
                clip: function (type, element, propertyValue) {
                    switch (type) {
                        case "name":
                            return "clip";
                        /* Clip needs to be unwrapped and stripped of its commas during extraction. */
                        case "extract":
                            var extracted;

                            /* If Velocity also extracted this value, skip extraction. */
                            if (CSS.RegEx.wrappedValueAlreadyExtracted.test(propertyValue)) {
                                extracted = propertyValue;
                            } else {
                                /* Remove the "rect()" wrapper. */
                                extracted = propertyValue.toString().match(CSS.RegEx.valueUnwrap);

                                /* Strip off commas. */
                                extracted = extracted ? extracted[1].replace(/,(\s+)?/g, " ") : propertyValue;
                            }

                            return extracted;
                        /* Clip needs to be re-wrapped during injection. */
                        case "inject":
                            return "rect(" + propertyValue + ")";
                    }
                },

                blur: function(type, element, propertyValue) {
                    switch (type) {
                        case "name":
                            return Velocity.State.isFirefox ? "filter" : "-webkit-filter";
                        case "extract":
                            var extracted = parseFloat(propertyValue);

                            /* If extracted is NaN, meaning the value isn't already extracted. */
                            if (!(extracted || extracted === 0)) {
                                var blurComponent = propertyValue.toString().match(/blur\(([0-9]+[A-z]+)\)/i);

                                /* If the filter string had a blur component, return just the blur value and unit type. */
                                if (blurComponent) {
                                    extracted = blurComponent[1];
                                /* If the component doesn't exist, default blur to 0. */
                                } else {
                                    extracted = 0;
                                }
                            }

                            return extracted;
                        /* Blur needs to be re-wrapped during injection. */
                        case "inject":
                            /* For the blur effect to be fully de-applied, it needs to be set to "none" instead of 0. */
                            if (!parseFloat(propertyValue)) {
                                return "none";
                            } else {
                                return "blur(" + propertyValue + ")";
                            }
                    }
                },

                /* <=IE8 do not support the standard opacity property. They use filter:alpha(opacity=INT) instead. */
                opacity: function (type, element, propertyValue) {
                    if (IE <= 8) {
                        switch (type) {
                            case "name":
                                return "filter";
                            case "extract":
                                /* <=IE8 return a "filter" value of "alpha(opacity=\d{1,3})".
                                   Extract the value and convert it to a decimal value to match the standard CSS opacity property's formatting. */
                                var extracted = propertyValue.toString().match(/alpha\(opacity=(.*)\)/i);

                                if (extracted) {
                                    /* Convert to decimal value. */
                                    propertyValue = extracted[1] / 100;
                                } else {
                                    /* When extracting opacity, default to 1 since a null value means opacity hasn't been set. */
                                    propertyValue = 1;
                                }

                                return propertyValue;
                            case "inject":
                                /* Opacified elements are required to have their zoom property set to a non-zero value. */
                                element.style.zoom = 1;

                                /* Setting the filter property on elements with certain font property combinations can result in a
                                   highly unappealing ultra-bolding effect. There's no way to remedy this throughout a tween, but dropping the
                                   value altogether (when opacity hits 1) at leasts ensures that the glitch is gone post-tweening. */
                                if (parseFloat(propertyValue) >= 1) {
                                    return "";
                                } else {
                                  /* As per the filter property's spec, convert the decimal value to a whole number and wrap the value. */
                                  return "alpha(opacity=" + parseInt(parseFloat(propertyValue) * 100, 10) + ")";
                                }
                        }
                    /* With all other browsers, normalization is not required; return the same values that were passed in. */
                    } else {
                        switch (type) {
                            case "name":
                                return "opacity";
                            case "extract":
                                return propertyValue;
                            case "inject":
                                return propertyValue;
                        }
                    }
                }
            },

            /*****************************
                Batched Registrations
            *****************************/

            /* Note: Batched normalizations extend the CSS.Normalizations.registered object. */
            register: function () {

                /*****************
                    Transforms
                *****************/

                /* Transforms are the subproperties contained by the CSS "transform" property. Transforms must undergo normalization
                   so that they can be referenced in a properties map by their individual names. */
                /* Note: When transforms are "set", they are actually assigned to a per-element transformCache. When all transform
                   setting is complete complete, CSS.flushTransformCache() must be manually called to flush the values to the DOM.
                   Transform setting is batched in this way to improve performance: the transform style only needs to be updated
                   once when multiple transform subproperties are being animated simultaneously. */
                /* Note: IE9 and Android Gingerbread have support for 2D -- but not 3D -- transforms. Since animating unsupported
                   transform properties results in the browser ignoring the *entire* transform string, we prevent these 3D values
                   from being normalized for these browsers so that tweening skips these properties altogether
                   (since it will ignore them as being unsupported by the browser.) */
                if (!(IE <= 9) && !Velocity.State.isGingerbread) {
                    /* Note: Since the standalone CSS "perspective" property and the CSS transform "perspective" subproperty
                    share the same name, the latter is given a unique token within Velocity: "transformPerspective". */
                    CSS.Lists.transformsBase = CSS.Lists.transformsBase.concat(CSS.Lists.transforms3D);
                }

                for (var i = 0; i < CSS.Lists.transformsBase.length; i++) {
                    /* Wrap the dynamically generated normalization function in a new scope so that transformName's value is
                    paired with its respective function. (Otherwise, all functions would take the final for loop's transformName.) */
                    (function() {
                        var transformName = CSS.Lists.transformsBase[i];

                        CSS.Normalizations.registered[transformName] = function (type, element, propertyValue) {
                            switch (type) {
                                /* The normalized property name is the parent "transform" property -- the property that is actually set in CSS. */
                                case "name":
                                    return "transform";
                                /* Transform values are cached onto a per-element transformCache object. */
                                case "extract":
                                    /* If this transform has yet to be assigned a value, return its null value. */
                                    if (Data(element) === undefined || Data(element).transformCache[transformName] === undefined) {
                                        /* Scale CSS.Lists.transformsBase default to 1 whereas all other transform properties default to 0. */
                                        return /^scale/i.test(transformName) ? 1 : 0;
                                    /* When transform values are set, they are wrapped in parentheses as per the CSS spec.
                                       Thus, when extracting their values (for tween calculations), we strip off the parentheses. */
                                    } else {
                                        return Data(element).transformCache[transformName].replace(/[()]/g, "");
                                    }
                                case "inject":
                                    var invalid = false;

                                    /* If an individual transform property contains an unsupported unit type, the browser ignores the *entire* transform property.
                                       Thus, protect users from themselves by skipping setting for transform values supplied with invalid unit types. */
                                    /* Switch on the base transform type; ignore the axis by removing the last letter from the transform's name. */
                                    switch (transformName.substr(0, transformName.length - 1)) {
                                        /* Whitelist unit types for each transform. */
                                        case "translate":
                                            invalid = !/(%|px|em|rem|vw|vh|\d)$/i.test(propertyValue);
                                            break;
                                        /* Since an axis-free "scale" property is supported as well, a little hack is used here to detect it by chopping off its last letter. */
                                        case "scal":
                                        case "scale":
                                            /* Chrome on Android has a bug in which scaled elements blur if their initial scale
                                               value is below 1 (which can happen with forcefeeding). Thus, we detect a yet-unset scale property
                                               and ensure that its first value is always 1. More info: http://stackoverflow.com/questions/10417890/css3-animations-with-transform-causes-blurred-elements-on-webkit/10417962#10417962 */
                                            if (Velocity.State.isAndroid && Data(element).transformCache[transformName] === undefined && propertyValue < 1) {
                                                propertyValue = 1;
                                            }

                                            invalid = !/(\d)$/i.test(propertyValue);
                                            break;
                                        case "skew":
                                            invalid = !/(deg|\d)$/i.test(propertyValue);
                                            break;
                                        case "rotate":
                                            invalid = !/(deg|\d)$/i.test(propertyValue);
                                            break;
                                    }

                                    if (!invalid) {
                                        /* As per the CSS spec, wrap the value in parentheses. */
                                        Data(element).transformCache[transformName] = "(" + propertyValue + ")";
                                    }

                                    /* Although the value is set on the transformCache object, return the newly-updated value for the calling code to process as normal. */
                                    return Data(element).transformCache[transformName];
                            }
                        };
                    })();
                }

                /*************
                    Colors
                *************/

                /* Since Velocity only animates a single numeric value per property, color animation is achieved by hooking the individual RGBA components of CSS color properties.
                   Accordingly, color values must be normalized (e.g. "#ff0000", "red", and "rgb(255, 0, 0)" ==> "255 0 0 1") so that their components can be injected/extracted by CSS.Hooks logic. */
                for (var i = 0; i < CSS.Lists.colors.length; i++) {
                    /* Wrap the dynamically generated normalization function in a new scope so that colorName's value is paired with its respective function.
                       (Otherwise, all functions would take the final for loop's colorName.) */
                    (function () {
                        var colorName = CSS.Lists.colors[i];

                        /* Note: In IE<=8, which support rgb but not rgba, color properties are reverted to rgb by stripping off the alpha component. */
                        CSS.Normalizations.registered[colorName] = function(type, element, propertyValue) {
                            switch (type) {
                                case "name":
                                    return colorName;
                                /* Convert all color values into the rgb format. (Old IE can return hex values and color names instead of rgb/rgba.) */
                                case "extract":
                                    var extracted;

                                    /* If the color is already in its hookable form (e.g. "255 255 255 1") due to having been previously extracted, skip extraction. */
                                    if (CSS.RegEx.wrappedValueAlreadyExtracted.test(propertyValue)) {
                                        extracted = propertyValue;
                                    } else {
                                        var converted,
                                            colorNames = {
                                                black: "rgb(0, 0, 0)",
                                                blue: "rgb(0, 0, 255)",
                                                gray: "rgb(128, 128, 128)",
                                                green: "rgb(0, 128, 0)",
                                                red: "rgb(255, 0, 0)",
                                                white: "rgb(255, 255, 255)"
                                            };

                                        /* Convert color names to rgb. */
                                        if (/^[A-z]+$/i.test(propertyValue)) {
                                            if (colorNames[propertyValue] !== undefined) {
                                                converted = colorNames[propertyValue]
                                            } else {
                                                /* If an unmatched color name is provided, default to black. */
                                                converted = colorNames.black;
                                            }
                                        /* Convert hex values to rgb. */
                                        } else if (CSS.RegEx.isHex.test(propertyValue)) {
                                            converted = "rgb(" + CSS.Values.hexToRgb(propertyValue).join(" ") + ")";
                                        /* If the provided color doesn't match any of the accepted color formats, default to black. */
                                        } else if (!(/^rgba?\(/i.test(propertyValue))) {
                                            converted = colorNames.black;
                                        }

                                        /* Remove the surrounding "rgb/rgba()" string then replace commas with spaces and strip
                                           repeated spaces (in case the value included spaces to begin with). */
                                        extracted = (converted || propertyValue).toString().match(CSS.RegEx.valueUnwrap)[1].replace(/,(\s+)?/g, " ");
                                    }

                                    /* So long as this isn't <=IE8, add a fourth (alpha) component if it's missing and default it to 1 (visible). */
                                    if (!(IE <= 8) && extracted.split(" ").length === 3) {
                                        extracted += " 1";
                                    }

                                    return extracted;
                                case "inject":
                                    /* If this is IE<=8 and an alpha component exists, strip it off. */
                                    if (IE <= 8) {
                                        if (propertyValue.split(" ").length === 4) {
                                            propertyValue = propertyValue.split(/\s+/).slice(0, 3).join(" ");
                                        }
                                    /* Otherwise, add a fourth (alpha) component if it's missing and default it to 1 (visible). */
                                    } else if (propertyValue.split(" ").length === 3) {
                                        propertyValue += " 1";
                                    }

                                    /* Re-insert the browser-appropriate wrapper("rgb/rgba()"), insert commas, and strip off decimal units
                                       on all values but the fourth (R, G, and B only accept whole numbers). */
                                    return (IE <= 8 ? "rgb" : "rgba") + "(" + propertyValue.replace(/\s+/g, ",").replace(/\.(\d)+(?=,)/g, "") + ")";
                            }
                        };
                    })();
                }
            }
        },

        /************************
           CSS Property Names
        ************************/

        Names: {
            /* Camelcase a property name into its JavaScript notation (e.g. "background-color" ==> "backgroundColor").
               Camelcasing is used to normalize property names between and across calls. */
            camelCase: function (property) {
                return property.replace(/-(\w)/g, function (match, subMatch) {
                    return subMatch.toUpperCase();
                });
            },

            /* For SVG elements, some properties (namely, dimensional ones) are GET/SET via the element's HTML attributes (instead of via CSS styles). */
            SVGAttribute: function (property) {
                var SVGAttributes = "width|height|x|y|cx|cy|r|rx|ry|x1|x2|y1|y2";

                /* Certain browsers require an SVG transform to be applied as an attribute. (Otherwise, application via CSS is preferable due to 3D support.) */
                if (IE || (Velocity.State.isAndroid && !Velocity.State.isChrome)) {
                    SVGAttributes += "|transform";
                }

                return new RegExp("^(" + SVGAttributes + ")$", "i").test(property);
            },

            /* Determine whether a property should be set with a vendor prefix. */
            /* If a prefixed version of the property exists, return it. Otherwise, return the original property name.
               If the property is not at all supported by the browser, return a false flag. */
            prefixCheck: function (property) {
                /* If this property has already been checked, return the cached value. */
                if (Velocity.State.prefixMatches[property]) {
                    return [ Velocity.State.prefixMatches[property], true ];
                } else {
                    var vendors = [ "", "Webkit", "Moz", "ms", "O" ];

                    for (var i = 0, vendorsLength = vendors.length; i < vendorsLength; i++) {
                        var propertyPrefixed;

                        if (i === 0) {
                            propertyPrefixed = property;
                        } else {
                            /* Capitalize the first letter of the property to conform to JavaScript vendor prefix notation (e.g. webkitFilter). */
                            propertyPrefixed = vendors[i] + property.replace(/^\w/, function(match) { return match.toUpperCase(); });
                        }

                        /* Check if the browser supports this property as prefixed. */
                        if (Type.isString(Velocity.State.prefixElement.style[propertyPrefixed])) {
                            /* Cache the match. */
                            Velocity.State.prefixMatches[property] = propertyPrefixed;

                            return [ propertyPrefixed, true ];
                        }
                    }

                    /* If the browser doesn't support this property in any form, include a false flag so that the caller can decide how to proceed. */
                    return [ property, false ];
                }
            }
        },

        /************************
           CSS Property Values
        ************************/

        Values: {
            /* Hex to RGB conversion. Copyright Tim Down: http://stackoverflow.com/questions/5623838/rgb-to-hex-and-hex-to-rgb */
            hexToRgb: function (hex) {
                var shortformRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i,
                    longformRegex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i,
                    rgbParts;

                hex = hex.replace(shortformRegex, function (m, r, g, b) {
                    return r + r + g + g + b + b;
                });

                rgbParts = longformRegex.exec(hex);

                return rgbParts ? [ parseInt(rgbParts[1], 16), parseInt(rgbParts[2], 16), parseInt(rgbParts[3], 16) ] : [ 0, 0, 0 ];
            },

            isCSSNullValue: function (value) {
                /* The browser defaults CSS values that have not been set to either 0 or one of several possible null-value strings.
                   Thus, we check for both falsiness and these special strings. */
                /* Null-value checking is performed to default the special strings to 0 (for the sake of tweening) or their hook
                   templates as defined as CSS.Hooks (for the sake of hook injection/extraction). */
                /* Note: Chrome returns "rgba(0, 0, 0, 0)" for an undefined color whereas IE returns "transparent". */
                return (value == 0 || /^(none|auto|transparent|(rgba\(0, ?0, ?0, ?0\)))$/i.test(value));
            },

            /* Retrieve a property's default unit type. Used for assigning a unit type when one is not supplied by the user. */
            getUnitType: function (property) {
                if (/^(rotate|skew)/i.test(property)) {
                    return "deg";
                } else if (/(^(scale|scaleX|scaleY|scaleZ|alpha|flexGrow|flexHeight|zIndex|fontWeight)$)|((opacity|red|green|blue|alpha)$)/i.test(property)) {
                    /* The above properties are unitless. */
                    return "";
                } else {
                    /* Default to px for all other properties. */
                    return "px";
                }
            },

            /* HTML elements default to an associated display type when they're not set to display:none. */
            /* Note: This function is used for correctly setting the non-"none" display value in certain Velocity redirects, such as fadeIn/Out. */
            getDisplayType: function (element) {
                var tagName = element && element.tagName.toString().toLowerCase();

                if (/^(b|big|i|small|tt|abbr|acronym|cite|code|dfn|em|kbd|strong|samp|var|a|bdo|br|img|map|object|q|script|span|sub|sup|button|input|label|select|textarea)$/i.test(tagName)) {
                    return "inline";
                } else if (/^(li)$/i.test(tagName)) {
                    return "list-item";
                } else if (/^(tr)$/i.test(tagName)) {
                    return "table-row";
                } else if (/^(table)$/i.test(tagName)) {
                    return "table";
                } else if (/^(tbody)$/i.test(tagName)) {
                    return "table-row-group";
                /* Default to "block" when no match is found. */
                } else {
                    return "block";
                }
            },

            /* The class add/remove functions are used to temporarily apply a "velocity-animating" class to elements while they're animating. */
            addClass: function (element, className) {
                if (element.classList) {
                    element.classList.add(className);
                } else {
                    element.className += (element.className.length ? " " : "") + className;
                }
            },

            removeClass: function (element, className) {
                if (element.classList) {
                    element.classList.remove(className);
                } else {
                    element.className = element.className.toString().replace(new RegExp("(^|\\s)" + className.split(" ").join("|") + "(\\s|$)", "gi"), " ");
                }
            }
        },

        /****************************
           Style Getting & Setting
        ****************************/

        /* The singular getPropertyValue, which routes the logic for all normalizations, hooks, and standard CSS properties. */
        getPropertyValue: function (element, property, rootPropertyValue, forceStyleLookup) {
            /* Get an element's computed property value. */
            /* Note: Retrieving the value of a CSS property cannot simply be performed by checking an element's
               style attribute (which only reflects user-defined values). Instead, the browser must be queried for a property's
               *computed* value. You can read more about getComputedStyle here: https://developer.mozilla.org/en/docs/Web/API/window.getComputedStyle */
            function computePropertyValue (element, property) {
                /* When box-sizing isn't set to border-box, height and width style values are incorrectly computed when an
                   element's scrollbars are visible (which expands the element's dimensions). Thus, we defer to the more accurate
                   offsetHeight/Width property, which includes the total dimensions for interior, border, padding, and scrollbar.
                   We subtract border and padding to get the sum of interior + scrollbar. */
                var computedValue = 0;

                /* IE<=8 doesn't support window.getComputedStyle, thus we defer to jQuery, which has an extensive array
                   of hacks to accurately retrieve IE8 property values. Re-implementing that logic here is not worth bloating the
                   codebase for a dying browser. The performance repercussions of using jQuery here are minimal since
                   Velocity is optimized to rarely (and sometimes never) query the DOM. Further, the $.css() codepath isn't that slow. */
                if (IE <= 8) {
                    computedValue = $.css(element, property); /* GET */
                /* All other browsers support getComputedStyle. The returned live object reference is cached onto its
                   associated element so that it does not need to be refetched upon every GET. */
                } else {
                    /* Browsers do not return height and width values for elements that are set to display:"none". Thus, we temporarily
                       toggle display to the element type's default value. */
                    var toggleDisplay = false;

                    if (/^(width|height)$/.test(property) && CSS.getPropertyValue(element, "display") === 0) {
                        toggleDisplay = true;
                        CSS.setPropertyValue(element, "display", CSS.Values.getDisplayType(element));
                    }

                    function revertDisplay () {
                        if (toggleDisplay) {
                            CSS.setPropertyValue(element, "display", "none");
                        }
                    }

                    if (!forceStyleLookup) {
                        if (property === "height" && CSS.getPropertyValue(element, "boxSizing").toString().toLowerCase() !== "border-box") {
                            var contentBoxHeight = element.offsetHeight - (parseFloat(CSS.getPropertyValue(element, "borderTopWidth")) || 0) - (parseFloat(CSS.getPropertyValue(element, "borderBottomWidth")) || 0) - (parseFloat(CSS.getPropertyValue(element, "paddingTop")) || 0) - (parseFloat(CSS.getPropertyValue(element, "paddingBottom")) || 0);
                            revertDisplay();

                            return contentBoxHeight;
                        } else if (property === "width" && CSS.getPropertyValue(element, "boxSizing").toString().toLowerCase() !== "border-box") {
                            var contentBoxWidth = element.offsetWidth - (parseFloat(CSS.getPropertyValue(element, "borderLeftWidth")) || 0) - (parseFloat(CSS.getPropertyValue(element, "borderRightWidth")) || 0) - (parseFloat(CSS.getPropertyValue(element, "paddingLeft")) || 0) - (parseFloat(CSS.getPropertyValue(element, "paddingRight")) || 0);
                            revertDisplay();

                            return contentBoxWidth;
                        }
                    }

                    var computedStyle;

                    /* For elements that Velocity hasn't been called on directly (e.g. when Velocity queries the DOM on behalf
                       of a parent of an element its animating), perform a direct getComputedStyle lookup since the object isn't cached. */
                    if (Data(element) === undefined) {
                        computedStyle = window.getComputedStyle(element, null); /* GET */
                    /* If the computedStyle object has yet to be cached, do so now. */
                    } else if (!Data(element).computedStyle) {
                        computedStyle = Data(element).computedStyle = window.getComputedStyle(element, null); /* GET */
                    /* If computedStyle is cached, use it. */
                    } else {
                        computedStyle = Data(element).computedStyle;
                    }

                    /* IE and Firefox do not return a value for the generic borderColor -- they only return individual values for each border side's color.
                       Also, in all browsers, when border colors aren't all the same, a compound value is returned that Velocity isn't setup to parse.
                       So, as a polyfill for querying individual border side colors, we just return the top border's color and animate all borders from that value. */
                    if (property === "borderColor") {
                        property = "borderTopColor";
                    }

                    /* IE9 has a bug in which the "filter" property must be accessed from computedStyle using the getPropertyValue method
                       instead of a direct property lookup. The getPropertyValue method is slower than a direct lookup, which is why we avoid it by default. */
                    if (IE === 9 && property === "filter") {
                        computedValue = computedStyle.getPropertyValue(property); /* GET */
                    } else {
                        computedValue = computedStyle[property];
                    }

                    /* Fall back to the property's style value (if defined) when computedValue returns nothing,
                       which can happen when the element hasn't been painted. */
                    if (computedValue === "" || computedValue === null) {
                        computedValue = element.style[property];
                    }

                    revertDisplay();
                }

                /* For top, right, bottom, and left (TRBL) values that are set to "auto" on elements of "fixed" or "absolute" position,
                   defer to jQuery for converting "auto" to a numeric value. (For elements with a "static" or "relative" position, "auto" has the same
                   effect as being set to 0, so no conversion is necessary.) */
                /* An example of why numeric conversion is necessary: When an element with "position:absolute" has an untouched "left"
                   property, which reverts to "auto", left's value is 0 relative to its parent element, but is often non-zero relative
                   to its *containing* (not parent) element, which is the nearest "position:relative" ancestor or the viewport (and always the viewport in the case of "position:fixed"). */
                if (computedValue === "auto" && /^(top|right|bottom|left)$/i.test(property)) {
                    var position = computePropertyValue(element, "position"); /* GET */

                    /* For absolute positioning, jQuery's $.position() only returns values for top and left;
                       right and bottom will have their "auto" value reverted to 0. */
                    /* Note: A jQuery object must be created here since jQuery doesn't have a low-level alias for $.position().
                       Not a big deal since we're currently in a GET batch anyway. */
                    if (position === "fixed" || (position === "absolute" && /top|left/i.test(property))) {
                        /* Note: jQuery strips the pixel unit from its returned values; we re-add it here to conform with computePropertyValue's behavior. */
                        computedValue = $(element).position()[property] + "px"; /* GET */
                    }
                }

                return computedValue;
            }

            var propertyValue;

            /* If this is a hooked property (e.g. "clipLeft" instead of the root property of "clip"),
               extract the hook's value from a normalized rootPropertyValue using CSS.Hooks.extractValue(). */
            if (CSS.Hooks.registered[property]) {
                var hook = property,
                    hookRoot = CSS.Hooks.getRoot(hook);

                /* If a cached rootPropertyValue wasn't passed in (which Velocity always attempts to do in order to avoid requerying the DOM),
                   query the DOM for the root property's value. */
                if (rootPropertyValue === undefined) {
                    /* Since the browser is now being directly queried, use the official post-prefixing property name for this lookup. */
                    rootPropertyValue = CSS.getPropertyValue(element, CSS.Names.prefixCheck(hookRoot)[0]); /* GET */
                }

                /* If this root has a normalization registered, peform the associated normalization extraction. */
                if (CSS.Normalizations.registered[hookRoot]) {
                    rootPropertyValue = CSS.Normalizations.registered[hookRoot]("extract", element, rootPropertyValue);
                }

                /* Extract the hook's value. */
                propertyValue = CSS.Hooks.extractValue(hook, rootPropertyValue);

            /* If this is a normalized property (e.g. "opacity" becomes "filter" in <=IE8) or "translateX" becomes "transform"),
               normalize the property's name and value, and handle the special case of transforms. */
            /* Note: Normalizing a property is mutually exclusive from hooking a property since hook-extracted values are strictly
               numerical and therefore do not require normalization extraction. */
            } else if (CSS.Normalizations.registered[property]) {
                var normalizedPropertyName,
                    normalizedPropertyValue;

                normalizedPropertyName = CSS.Normalizations.registered[property]("name", element);

                /* Transform values are calculated via normalization extraction (see below), which checks against the element's transformCache.
                   At no point do transform GETs ever actually query the DOM; initial stylesheet values are never processed.
                   This is because parsing 3D transform matrices is not always accurate and would bloat our codebase;
                   thus, normalization extraction defaults initial transform values to their zero-values (e.g. 1 for scaleX and 0 for translateX). */
                if (normalizedPropertyName !== "transform") {
                    normalizedPropertyValue = computePropertyValue(element, CSS.Names.prefixCheck(normalizedPropertyName)[0]); /* GET */

                    /* If the value is a CSS null-value and this property has a hook template, use that zero-value template so that hooks can be extracted from it. */
                    if (CSS.Values.isCSSNullValue(normalizedPropertyValue) && CSS.Hooks.templates[property]) {
                        normalizedPropertyValue = CSS.Hooks.templates[property][1];
                    }
                }

                propertyValue = CSS.Normalizations.registered[property]("extract", element, normalizedPropertyValue);
            }

            /* If a (numeric) value wasn't produced via hook extraction or normalization, query the DOM. */
            if (!/^[\d-]/.test(propertyValue)) {
                /* For SVG elements, dimensional properties (which SVGAttribute() detects) are tweened via
                   their HTML attribute values instead of their CSS style values. */
                if (Data(element) && Data(element).isSVG && CSS.Names.SVGAttribute(property)) {
                    /* Since the height/width attribute values must be set manually, they don't reflect computed values.
                       Thus, we use use getBBox() to ensure we always get values for elements with undefined height/width attributes. */
                    if (/^(height|width)$/i.test(property)) {
                        /* Firefox throws an error if .getBBox() is called on an SVG that isn't attached to the DOM. */
                        try {
                            propertyValue = element.getBBox()[property];
                        } catch (error) {
                            propertyValue = 0;
                        }
                    /* Otherwise, access the attribute value directly. */
                    } else {
                        propertyValue = element.getAttribute(property);
                    }
                } else {
                    propertyValue = computePropertyValue(element, CSS.Names.prefixCheck(property)[0]); /* GET */
                }
            }

            /* Since property lookups are for animation purposes (which entails computing the numeric delta between start and end values),
               convert CSS null-values to an integer of value 0. */
            if (CSS.Values.isCSSNullValue(propertyValue)) {
                propertyValue = 0;
            }

            if (Velocity.debug >= 2) console.log("Get " + property + ": " + propertyValue);

            return propertyValue;
        },

        /* The singular setPropertyValue, which routes the logic for all normalizations, hooks, and standard CSS properties. */
        setPropertyValue: function(element, property, propertyValue, rootPropertyValue, scrollData) {
            var propertyName = property;

            /* In order to be subjected to call options and element queueing, scroll animation is routed through Velocity as if it were a standard CSS property. */
            if (property === "scroll") {
                /* If a container option is present, scroll the container instead of the browser window. */
                if (scrollData.container) {
                    scrollData.container["scroll" + scrollData.direction] = propertyValue;
                /* Otherwise, Velocity defaults to scrolling the browser window. */
                } else {
                    if (scrollData.direction === "Left") {
                        window.scrollTo(propertyValue, scrollData.alternateValue);
                    } else {
                        window.scrollTo(scrollData.alternateValue, propertyValue);
                    }
                }
            } else {
                /* Transforms (translateX, rotateZ, etc.) are applied to a per-element transformCache object, which is manually flushed via flushTransformCache().
                   Thus, for now, we merely cache transforms being SET. */
                if (CSS.Normalizations.registered[property] && CSS.Normalizations.registered[property]("name", element) === "transform") {
                    /* Perform a normalization injection. */
                    /* Note: The normalization logic handles the transformCache updating. */
                    CSS.Normalizations.registered[property]("inject", element, propertyValue);

                    propertyName = "transform";
                    propertyValue = Data(element).transformCache[property];
                } else {
                    /* Inject hooks. */
                    if (CSS.Hooks.registered[property]) {
                        var hookName = property,
                            hookRoot = CSS.Hooks.getRoot(property);

                        /* If a cached rootPropertyValue was not provided, query the DOM for the hookRoot's current value. */
                        rootPropertyValue = rootPropertyValue || CSS.getPropertyValue(element, hookRoot); /* GET */

                        propertyValue = CSS.Hooks.injectValue(hookName, propertyValue, rootPropertyValue);
                        property = hookRoot;
                    }

                    /* Normalize names and values. */
                    if (CSS.Normalizations.registered[property]) {
                        propertyValue = CSS.Normalizations.registered[property]("inject", element, propertyValue);
                        property = CSS.Normalizations.registered[property]("name", element);
                    }

                    /* Assign the appropriate vendor prefix before performing an official style update. */
                    propertyName = CSS.Names.prefixCheck(property)[0];

                    /* A try/catch is used for IE<=8, which throws an error when "invalid" CSS values are set, e.g. a negative width.
                       Try/catch is avoided for other browsers since it incurs a performance overhead. */
                    if (IE <= 8) {
                        try {
                            element.style[propertyName] = propertyValue;
                        } catch (error) { if (Velocity.debug) console.log("Browser does not support [" + propertyValue + "] for [" + propertyName + "]"); }
                    /* SVG elements have their dimensional properties (width, height, x, y, cx, etc.) applied directly as attributes instead of as styles. */
                    /* Note: IE8 does not support SVG elements, so it's okay that we skip it for SVG animation. */
                    } else if (Data(element) && Data(element).isSVG && CSS.Names.SVGAttribute(property)) {
                        /* Note: For SVG attributes, vendor-prefixed property names are never used. */
                        /* Note: Not all CSS properties can be animated via attributes, but the browser won't throw an error for unsupported properties. */
                        element.setAttribute(property, propertyValue);
                    } else {
                        element.style[propertyName] = propertyValue;
                    }

                    if (Velocity.debug >= 2) console.log("Set " + property + " (" + propertyName + "): " + propertyValue);
                }
            }

            /* Return the normalized property name and value in case the caller wants to know how these values were modified before being applied to the DOM. */
            return [ propertyName, propertyValue ];
        },

        /* To increase performance by batching transform updates into a single SET, transforms are not directly applied to an element until flushTransformCache() is called. */
        /* Note: Velocity applies transform properties in the same order that they are chronogically introduced to the element's CSS styles. */
        flushTransformCache: function(element) {
            var transformString = "";

            /* Certain browsers require that SVG transforms be applied as an attribute. However, the SVG transform attribute takes a modified version of CSS's transform string
               (units are dropped and, except for skewX/Y, subproperties are merged into their master property -- e.g. scaleX and scaleY are merged into scale(X Y). */
            if ((IE || (Velocity.State.isAndroid && !Velocity.State.isChrome)) && Data(element).isSVG) {
                /* Since transform values are stored in their parentheses-wrapped form, we use a helper function to strip out their numeric values.
                   Further, SVG transform properties only take unitless (representing pixels) values, so it's okay that parseFloat() strips the unit suffixed to the float value. */
                function getTransformFloat (transformProperty) {
                    return parseFloat(CSS.getPropertyValue(element, transformProperty));
                }

                /* Create an object to organize all the transforms that we'll apply to the SVG element. To keep the logic simple,
                   we process *all* transform properties -- even those that may not be explicitly applied (since they default to their zero-values anyway). */
                var SVGTransforms = {
                    translate: [ getTransformFloat("translateX"), getTransformFloat("translateY") ],
                    skewX: [ getTransformFloat("skewX") ], skewY: [ getTransformFloat("skewY") ],
                    /* If the scale property is set (non-1), use that value for the scaleX and scaleY values
                       (this behavior mimics the result of animating all these properties at once on HTML elements). */
                    scale: getTransformFloat("scale") !== 1 ? [ getTransformFloat("scale"), getTransformFloat("scale") ] : [ getTransformFloat("scaleX"), getTransformFloat("scaleY") ],
                    /* Note: SVG's rotate transform takes three values: rotation degrees followed by the X and Y values
                       defining the rotation's origin point. We ignore the origin values (default them to 0). */
                    rotate: [ getTransformFloat("rotateZ"), 0, 0 ]
                };

                /* Iterate through the transform properties in the user-defined property map order.
                   (This mimics the behavior of non-SVG transform animation.) */
                $.each(Data(element).transformCache, function(transformName) {
                    /* Except for with skewX/Y, revert the axis-specific transform subproperties to their axis-free master
                       properties so that they match up with SVG's accepted transform properties. */
                    if (/^translate/i.test(transformName)) {
                        transformName = "translate";
                    } else if (/^scale/i.test(transformName)) {
                        transformName = "scale";
                    } else if (/^rotate/i.test(transformName)) {
                        transformName = "rotate";
                    }

                    /* Check that we haven't yet deleted the property from the SVGTransforms container. */
                    if (SVGTransforms[transformName]) {
                        /* Append the transform property in the SVG-supported transform format. As per the spec, surround the space-delimited values in parentheses. */
                        transformString += transformName + "(" + SVGTransforms[transformName].join(" ") + ")" + " ";

                        /* After processing an SVG transform property, delete it from the SVGTransforms container so we don't
                           re-insert the same master property if we encounter another one of its axis-specific properties. */
                        delete SVGTransforms[transformName];
                    }
                });
            } else {
                var transformValue,
                    perspective;

                /* Transform properties are stored as members of the transformCache object. Concatenate all the members into a string. */
                $.each(Data(element).transformCache, function(transformName) {
                    transformValue = Data(element).transformCache[transformName];

                    /* Transform's perspective subproperty must be set first in order to take effect. Store it temporarily. */
                    if (transformName === "transformPerspective") {
                        perspective = transformValue;
                        return true;
                    }

                    /* IE9 only supports one rotation type, rotateZ, which it refers to as "rotate". */
                    if (IE === 9 && transformName === "rotateZ") {
                        transformName = "rotate";
                    }

                    transformString += transformName + transformValue + " ";
                });

                /* If present, set the perspective subproperty first. */
                if (perspective) {
                    transformString = "perspective" + perspective + " " + transformString;
                }
            }

            CSS.setPropertyValue(element, "transform", transformString);
        }
    };

    /* Register hooks and normalizations. */
    CSS.Hooks.register();
    CSS.Normalizations.register();

    /* Allow hook setting in the same fashion as jQuery's $.css(). */
    Velocity.hook = function (elements, arg2, arg3) {
        var value = undefined;

        elements = sanitizeElements(elements);

        $.each(elements, function(i, element) {
            /* Initialize Velocity's per-element data cache if this element hasn't previously been animated. */
            if (Data(element) === undefined) {
                Velocity.init(element);
            }

            /* Get property value. If an element set was passed in, only return the value for the first element. */
            if (arg3 === undefined) {
                if (value === undefined) {
                    value = Velocity.CSS.getPropertyValue(element, arg2);
                }
            /* Set property value. */
            } else {
                /* sPV returns an array of the normalized propertyName/propertyValue pair used to update the DOM. */
                var adjustedSet = Velocity.CSS.setPropertyValue(element, arg2, arg3);

                /* Transform properties don't automatically set. They have to be flushed to the DOM. */
                if (adjustedSet[0] === "transform") {
                    Velocity.CSS.flushTransformCache(element);
                }

                value = adjustedSet;
            }
        });

        return value;
    };

    /*****************
        Animation
    *****************/

    var animate = function() {

        /******************
            Call Chain
        ******************/

        /* Logic for determining what to return to the call stack when exiting out of Velocity. */
        function getChain () {
            /* If we are using the utility function, attempt to return this call's promise. If no promise library was detected,
               default to null instead of returning the targeted elements so that utility function's return value is standardized. */
            if (isUtility) {
                return promiseData.promise || null;
            /* Otherwise, if we're using $.fn, return the jQuery-/Zepto-wrapped element set. */
            } else {
                return elementsWrapped;
            }
        }

        /*************************
           Arguments Assignment
        *************************/

        /* To allow for expressive CoffeeScript code, Velocity supports an alternative syntax in which "elements" (or "e"), "properties" (or "p"), and "options" (or "o")
           objects are defined on a container object that's passed in as Velocity's sole argument. */
        /* Note: Some browsers automatically populate arguments with a "properties" object. We detect it by checking for its default "names" property. */
        var syntacticSugar = (arguments[0] && (arguments[0].p || (($.isPlainObject(arguments[0].properties) && !arguments[0].properties.names) || Type.isString(arguments[0].properties)))),
            /* Whether Velocity was called via the utility function (as opposed to on a jQuery/Zepto object). */
            isUtility,
            /* When Velocity is called via the utility function ($.Velocity()/Velocity()), elements are explicitly
               passed in as the first parameter. Thus, argument positioning varies. We normalize them here. */
            elementsWrapped,
            argumentIndex;

        var elements,
            propertiesMap,
            options;

        /* Detect jQuery/Zepto elements being animated via the $.fn method. */
        if (Type.isWrapped(this)) {
            isUtility = false;

            argumentIndex = 0;
            elements = this;
            elementsWrapped = this;
        /* Otherwise, raw elements are being animated via the utility function. */
        } else {
            isUtility = true;

            argumentIndex = 1;
            elements = syntacticSugar ? (arguments[0].elements || arguments[0].e) : arguments[0];
        }

        elements = sanitizeElements(elements);

        if (!elements) {
            return;
        }

        if (syntacticSugar) {
            propertiesMap = arguments[0].properties || arguments[0].p;
            options = arguments[0].options || arguments[0].o;
        } else {
            propertiesMap = arguments[argumentIndex];
            options = arguments[argumentIndex + 1];
        }

        /* The length of the element set (in the form of a nodeList or an array of elements) is defaulted to 1 in case a
           single raw DOM element is passed in (which doesn't contain a length property). */
        var elementsLength = elements.length,
            elementsIndex = 0;

        /***************************
            Argument Overloading
        ***************************/

        /* Support is included for jQuery's argument overloading: $.animate(propertyMap [, duration] [, easing] [, complete]).
           Overloading is detected by checking for the absence of an object being passed into options. */
        /* Note: The stop and finish actions do not accept animation options, and are therefore excluded from this check. */
        if (!/^(stop|finish)$/i.test(propertiesMap) && !$.isPlainObject(options)) {
            /* The utility function shifts all arguments one position to the right, so we adjust for that offset. */
            var startingArgumentPosition = argumentIndex + 1;

            options = {};

            /* Iterate through all options arguments */
            for (var i = startingArgumentPosition; i < arguments.length; i++) {
                /* Treat a number as a duration. Parse it out. */
                /* Note: The following RegEx will return true if passed an array with a number as its first item.
                   Thus, arrays are skipped from this check. */
                if (!Type.isArray(arguments[i]) && (/^(fast|normal|slow)$/i.test(arguments[i]) || /^\d/.test(arguments[i]))) {
                    options.duration = arguments[i];
                /* Treat strings and arrays as easings. */
                } else if (Type.isString(arguments[i]) || Type.isArray(arguments[i])) {
                    options.easing = arguments[i];
                /* Treat a function as a complete callback. */
                } else if (Type.isFunction(arguments[i])) {
                    options.complete = arguments[i];
                }
            }
        }

        /***************
            Promises
        ***************/

        var promiseData = {
                promise: null,
                resolver: null,
                rejecter: null
            };

        /* If this call was made via the utility function (which is the default method of invocation when jQuery/Zepto are not being used), and if
           promise support was detected, create a promise object for this call and store references to its resolver and rejecter methods. The resolve
           method is used when a call completes naturally or is prematurely stopped by the user. In both cases, completeCall() handles the associated
           call cleanup and promise resolving logic. The reject method is used when an invalid set of arguments is passed into a Velocity call. */
        /* Note: Velocity employs a call-based queueing architecture, which means that stopping an animating element actually stops the full call that
           triggered it -- not that one element exclusively. Similarly, there is one promise per call, and all elements targeted by a Velocity call are
           grouped together for the purposes of resolving and rejecting a promise. */
        if (isUtility && Velocity.Promise) {
            promiseData.promise = new Velocity.Promise(function (resolve, reject) {
                promiseData.resolver = resolve;
                promiseData.rejecter = reject;
            });
        }

        /*********************
           Action Detection
        *********************/

        /* Velocity's behavior is categorized into "actions": Elements can either be specially scrolled into view,
           or they can be started, stopped, or reversed. If a literal or referenced properties map is passed in as Velocity's
           first argument, the associated action is "start". Alternatively, "scroll", "reverse", or "stop" can be passed in instead of a properties map. */
        var action;

        switch (propertiesMap) {
            case "scroll":
                action = "scroll";
                break;

            case "reverse":
                action = "reverse";
                break;

            case "finish":
            case "stop":
                /*******************
                    Action: Stop
                *******************/

                /* Clear the currently-active delay on each targeted element. */
                $.each(elements, function(i, element) {
                    if (Data(element) && Data(element).delayTimer) {
                        /* Stop the timer from triggering its cached next() function. */
                        clearTimeout(Data(element).delayTimer.setTimeout);

                        /* Manually call the next() function so that the subsequent queue items can progress. */
                        if (Data(element).delayTimer.next) {
                            Data(element).delayTimer.next();
                        }

                        delete Data(element).delayTimer;
                    }
                });

                var callsToStop = [];

                /* When the stop action is triggered, the elements' currently active call is immediately stopped. The active call might have
                   been applied to multiple elements, in which case all of the call's elements will be stopped. When an element
                   is stopped, the next item in its animation queue is immediately triggered. */
                /* An additional argument may be passed in to clear an element's remaining queued calls. Either true (which defaults to the "fx" queue)
                   or a custom queue string can be passed in. */
                /* Note: The stop command runs prior to Velocity's Queueing phase since its behavior is intended to take effect *immediately*,
                   regardless of the element's current queue state. */

                /* Iterate through every active call. */
                $.each(Velocity.State.calls, function(i, activeCall) {
                    /* Inactive calls are set to false by the logic inside completeCall(). Skip them. */
                    if (activeCall) {
                        /* Iterate through the active call's targeted elements. */
                        $.each(activeCall[1], function(k, activeElement) {
                            /* If true was passed in as a secondary argument, clear absolutely all calls on this element. Otherwise, only
                               clear calls associated with the relevant queue. */
                            /* Call stopping logic works as follows:
                               - options === true --> stop current default queue calls (and queue:false calls), including remaining queued ones.
                               - options === undefined --> stop current queue:"" call and all queue:false calls.
                               - options === false --> stop only queue:false calls.
                               - options === "custom" --> stop current queue:"custom" call, including remaining queued ones (there is no functionality to only clear the currently-running queue:"custom" call). */
                            var queueName = (options === undefined) ? "" : options;

                            if (queueName !== true && (activeCall[2].queue !== queueName) && !(options === undefined && activeCall[2].queue === false)) {
                                return true;
                            }

                            /* Iterate through the calls targeted by the stop command. */
                            $.each(elements, function(l, element) {                                
                                /* Check that this call was applied to the target element. */
                                if (element === activeElement) {
                                    /* Optionally clear the remaining queued calls. */
                                    if (options === true || Type.isString(options)) {
                                        /* Iterate through the items in the element's queue. */
                                        $.each($.queue(element, Type.isString(options) ? options : ""), function(_, item) {
                                            /* The queue array can contain an "inprogress" string, which we skip. */
                                            if (Type.isFunction(item)) {
                                                /* Pass the item's callback a flag indicating that we want to abort from the queue call.
                                                   (Specifically, the queue will resolve the call's associated promise then abort.)  */
                                                item(null, true);
                                            }
                                        });

                                        /* Clearing the $.queue() array is achieved by resetting it to []. */
                                        $.queue(element, Type.isString(options) ? options : "", []);
                                    }

                                    if (propertiesMap === "stop") {
                                        /* Since "reverse" uses cached start values (the previous call's endValues), these values must be
                                           changed to reflect the final value that the elements were actually tweened to. */
                                        /* Note: If only queue:false animations are currently running on an element, it won't have a tweensContainer
                                           object. Also, queue:false animations can't be reversed. */
                                        if (Data(element) && Data(element).tweensContainer && queueName !== false) {
                                            $.each(Data(element).tweensContainer, function(m, activeTween) {
                                                activeTween.endValue = activeTween.currentValue;
                                            });
                                        }

                                        callsToStop.push(i);
                                    } else if (propertiesMap === "finish") {
                                        /* To get active tweens to finish immediately, we forcefully shorten their durations to 1ms so that
                                        they finish upon the next rAf tick then proceed with normal call completion logic. */
                                        activeCall[2].duration = 1;
                                    }
                                }
                            });
                        });
                    }
                });

                /* Prematurely call completeCall() on each matched active call. Pass an additional flag for "stop" to indicate
                   that the complete callback and display:none setting should be skipped since we're completing prematurely. */
                if (propertiesMap === "stop") {
                    $.each(callsToStop, function(i, j) {
                        completeCall(j, true);
                    });

                    if (promiseData.promise) {
                        /* Immediately resolve the promise associated with this stop call since stop runs synchronously. */
                        promiseData.resolver(elements);
                    }
                }

                /* Since we're stopping, and not proceeding with queueing, exit out of Velocity. */
                return getChain();

            default:
                /* Treat a non-empty plain object as a literal properties map. */
                if ($.isPlainObject(propertiesMap) && !Type.isEmptyObject(propertiesMap)) {
                    action = "start";

                /****************
                    Redirects
                ****************/

                /* Check if a string matches a registered redirect (see Redirects above). */
                } else if (Type.isString(propertiesMap) && Velocity.Redirects[propertiesMap]) {
                    var opts = $.extend({}, options),
                        durationOriginal = opts.duration,
                        delayOriginal = opts.delay || 0;

                    /* If the backwards option was passed in, reverse the element set so that elements animate from the last to the first. */
                    if (opts.backwards === true) {
                        elements = $.extend(true, [], elements).reverse();
                    }

                    /* Individually trigger the redirect for each element in the set to prevent users from having to handle iteration logic in their redirect. */
                    $.each(elements, function(elementIndex, element) {
                        /* If the stagger option was passed in, successively delay each element by the stagger value (in ms). Retain the original delay value. */
                        if (parseFloat(opts.stagger)) {
                            opts.delay = delayOriginal + (parseFloat(opts.stagger) * elementIndex);
                        } else if (Type.isFunction(opts.stagger)) {
                            opts.delay = delayOriginal + opts.stagger.call(element, elementIndex, elementsLength);
                        }

                        /* If the drag option was passed in, successively increase/decrease (depending on the presense of opts.backwards)
                           the duration of each element's animation, using floors to prevent producing very short durations. */
                        if (opts.drag) {
                            /* Default the duration of UI pack effects (callouts and transitions) to 1000ms instead of the usual default duration of 400ms. */
                            opts.duration = parseFloat(durationOriginal) || (/^(callout|transition)/.test(propertiesMap) ? 1000 : DURATION_DEFAULT);

                            /* For each element, take the greater duration of: A) animation completion percentage relative to the original duration,
                               B) 75% of the original duration, or C) a 200ms fallback (in case duration is already set to a low value).
                               The end result is a baseline of 75% of the redirect's duration that increases/decreases as the end of the element set is approached. */
                            opts.duration = Math.max(opts.duration * (opts.backwards ? 1 - elementIndex/elementsLength : (elementIndex + 1) / elementsLength), opts.duration * 0.75, 200);
                        }

                        /* Pass in the call's opts object so that the redirect can optionally extend it. It defaults to an empty object instead of null to
                           reduce the opts checking logic required inside the redirect. */
                        Velocity.Redirects[propertiesMap].call(element, element, opts || {}, elementIndex, elementsLength, elements, promiseData.promise ? promiseData : undefined);
                    });

                    /* Since the animation logic resides within the redirect's own code, abort the remainder of this call.
                       (The performance overhead up to this point is virtually non-existant.) */
                    /* Note: The jQuery call chain is kept intact by returning the complete element set. */
                    return getChain();
                } else {
                    var abortError = "Velocity: First argument (" + propertiesMap + ") was not a property map, a known action, or a registered redirect. Aborting.";

                    if (promiseData.promise) {
                        promiseData.rejecter(new Error(abortError));
                    } else {
                        console.log(abortError);
                    }

                    return getChain();
                }
        }

        /**************************
            Call-Wide Variables
        **************************/

        /* A container for CSS unit conversion ratios (e.g. %, rem, and em ==> px) that is used to cache ratios across all elements
           being animated in a single Velocity call. Calculating unit ratios necessitates DOM querying and updating, and is therefore
           avoided (via caching) wherever possible. This container is call-wide instead of page-wide to avoid the risk of using stale
           conversion metrics across Velocity animations that are not immediately consecutively chained. */
        var callUnitConversionData = {
                lastParent: null,
                lastPosition: null,
                lastFontSize: null,
                lastPercentToPxWidth: null,
                lastPercentToPxHeight: null,
                lastEmToPx: null,
                remToPx: null,
                vwToPx: null,
                vhToPx: null
            };

        /* A container for all the ensuing tween data and metadata associated with this call. This container gets pushed to the page-wide
           Velocity.State.calls array that is processed during animation ticking. */
        var call = [];

        /************************
           Element Processing
        ************************/

        /* Element processing consists of three parts -- data processing that cannot go stale and data processing that *can* go stale (i.e. third-party style modifications):
           1) Pre-Queueing: Element-wide variables, including the element's data storage, are instantiated. Call options are prepared. If triggered, the Stop action is executed.
           2) Queueing: The logic that runs once this call has reached its point of execution in the element's $.queue() stack. Most logic is placed here to avoid risking it becoming stale.
           3) Pushing: Consolidation of the tween data followed by its push onto the global in-progress calls container.
        */

        function processElement () {

            /*************************
               Part I: Pre-Queueing
            *************************/

            /***************************
               Element-Wide Variables
            ***************************/

            var element = this,
                /* The runtime opts object is the extension of the current call's options and Velocity's page-wide option defaults. */
                opts = $.extend({}, Velocity.defaults, options),
                /* A container for the processed data associated with each property in the propertyMap.
                   (Each property in the map produces its own "tween".) */
                tweensContainer = {},
                elementUnitConversionData;

            /******************
               Element Init
            ******************/

            if (Data(element) === undefined) {
                Velocity.init(element);
            }

            /******************
               Option: Delay
            ******************/

            /* Since queue:false doesn't respect the item's existing queue, we avoid injecting its delay here (it's set later on). */
            /* Note: Velocity rolls its own delay function since jQuery doesn't have a utility alias for $.fn.delay()
               (and thus requires jQuery element creation, which we avoid since its overhead includes DOM querying). */
            if (parseFloat(opts.delay) && opts.queue !== false) {
                $.queue(element, opts.queue, function(next) {
                    /* This is a flag used to indicate to the upcoming completeCall() function that this queue entry was initiated by Velocity. See completeCall() for further details. */
                    Velocity.velocityQueueEntryFlag = true;

                    /* The ensuing queue item (which is assigned to the "next" argument that $.queue() automatically passes in) will be triggered after a setTimeout delay.
                       The setTimeout is stored so that it can be subjected to clearTimeout() if this animation is prematurely stopped via Velocity's "stop" command. */
                    Data(element).delayTimer = {
                        setTimeout: setTimeout(next, parseFloat(opts.delay)),
                        next: next
                    };
                });
            }

            /*********************
               Option: Duration
            *********************/

            /* Support for jQuery's named durations. */
            switch (opts.duration.toString().toLowerCase()) {
                case "fast":
                    opts.duration = 200;
                    break;

                case "normal":
                    opts.duration = DURATION_DEFAULT;
                    break;

                case "slow":
                    opts.duration = 600;
                    break;

                default:
                    /* Remove the potential "ms" suffix and default to 1 if the user is attempting to set a duration of 0 (in order to produce an immediate style change). */
                    opts.duration = parseFloat(opts.duration) || 1;
            }

            /************************
               Global Option: Mock
            ************************/

            if (Velocity.mock !== false) {
                /* In mock mode, all animations are forced to 1ms so that they occur immediately upon the next rAF tick.
                   Alternatively, a multiplier can be passed in to time remap all delays and durations. */
                if (Velocity.mock === true) {
                    opts.duration = opts.delay = 1;
                } else {
                    opts.duration *= parseFloat(Velocity.mock) || 1;
                    opts.delay *= parseFloat(Velocity.mock) || 1;
                }
            }

            /*******************
               Option: Easing
            *******************/

            opts.easing = getEasing(opts.easing, opts.duration);

            /**********************
               Option: Callbacks
            **********************/

            /* Callbacks must functions. Otherwise, default to null. */
            if (opts.begin && !Type.isFunction(opts.begin)) {
                opts.begin = null;
            }

            if (opts.progress && !Type.isFunction(opts.progress)) {
                opts.progress = null;
            }

            if (opts.complete && !Type.isFunction(opts.complete)) {
                opts.complete = null;
            }

            /*********************************
               Option: Display & Visibility
            *********************************/

            /* Refer to Velocity's documentation (VelocityJS.org/#displayAndVisibility) for a description of the display and visibility options' behavior. */
            /* Note: We strictly check for undefined instead of falsiness because display accepts an empty string value. */
            if (opts.display !== undefined && opts.display !== null) {
                opts.display = opts.display.toString().toLowerCase();

                /* Users can pass in a special "auto" value to instruct Velocity to set the element to its default display value. */
                if (opts.display === "auto") {
                    opts.display = Velocity.CSS.Values.getDisplayType(element);
                }
            }

            if (opts.visibility !== undefined && opts.visibility !== null) {
                opts.visibility = opts.visibility.toString().toLowerCase();
            }

            /**********************
               Option: mobileHA
            **********************/

            /* When set to true, and if this is a mobile device, mobileHA automatically enables hardware acceleration (via a null transform hack)
               on animating elements. HA is removed from the element at the completion of its animation. */
            /* Note: Android Gingerbread doesn't support HA. If a null transform hack (mobileHA) is in fact set, it will prevent other tranform subproperties from taking effect. */
            /* Note: You can read more about the use of mobileHA in Velocity's documentation: VelocityJS.org/#mobileHA. */
            opts.mobileHA = (opts.mobileHA && Velocity.State.isMobile && !Velocity.State.isGingerbread);

            /***********************
               Part II: Queueing
            ***********************/

            /* When a set of elements is targeted by a Velocity call, the set is broken up and each element has the current Velocity call individually queued onto it.
               In this way, each element's existing queue is respected; some elements may already be animating and accordingly should not have this current Velocity call triggered immediately. */
            /* In each queue, tween data is processed for each animating property then pushed onto the call-wide calls array. When the last element in the set has had its tweens processed,
               the call array is pushed to Velocity.State.calls for live processing by the requestAnimationFrame tick. */
            function buildQueue (next) {

                /*******************
                   Option: Begin
                *******************/

                /* The begin callback is fired once per call -- not once per elemenet -- and is passed the full raw DOM element set as both its context and its first argument. */
                if (opts.begin && elementsIndex === 0) {
                    /* We throw callbacks in a setTimeout so that thrown errors don't halt the execution of Velocity itself. */
                    try {
                        opts.begin.call(elements, elements);
                    } catch (error) {
                        setTimeout(function() { throw error; }, 1);
                    }
                }

                /*****************************************
                   Tween Data Construction (for Scroll)
                *****************************************/

                /* Note: In order to be subjected to chaining and animation options, scroll's tweening is routed through Velocity as if it were a standard CSS property animation. */
                if (action === "scroll") {
                    /* The scroll action uniquely takes an optional "offset" option -- specified in pixels -- that offsets the targeted scroll position. */
                    var scrollDirection = (/^x$/i.test(opts.axis) ? "Left" : "Top"),
                        scrollOffset = parseFloat(opts.offset) || 0,
                        scrollPositionCurrent,
                        scrollPositionCurrentAlternate,
                        scrollPositionEnd;

                    /* Scroll also uniquely takes an optional "container" option, which indicates the parent element that should be scrolled --
                       as opposed to the browser window itself. This is useful for scrolling toward an element that's inside an overflowing parent element. */
                    if (opts.container) {
                        /* Ensure that either a jQuery object or a raw DOM element was passed in. */
                        if (Type.isWrapped(opts.container) || Type.isNode(opts.container)) {
                            /* Extract the raw DOM element from the jQuery wrapper. */
                            opts.container = opts.container[0] || opts.container;
                            /* Note: Unlike other properties in Velocity, the browser's scroll position is never cached since it so frequently changes
                               (due to the user's natural interaction with the page). */
                            scrollPositionCurrent = opts.container["scroll" + scrollDirection]; /* GET */

                            /* $.position() values are relative to the container's currently viewable area (without taking into account the container's true dimensions
                               -- say, for example, if the container was not overflowing). Thus, the scroll end value is the sum of the child element's position *and*
                               the scroll container's current scroll position. */
                            scrollPositionEnd = (scrollPositionCurrent + $(element).position()[scrollDirection.toLowerCase()]) + scrollOffset; /* GET */
                        /* If a value other than a jQuery object or a raw DOM element was passed in, default to null so that this option is ignored. */
                        } else {
                            opts.container = null;
                        }
                    } else {
                        /* If the window itself is being scrolled -- not a containing element -- perform a live scroll position lookup using
                           the appropriate cached property names (which differ based on browser type). */
                        scrollPositionCurrent = Velocity.State.scrollAnchor[Velocity.State["scrollProperty" + scrollDirection]]; /* GET */
                        /* When scrolling the browser window, cache the alternate axis's current value since window.scrollTo() doesn't let us change only one value at a time. */
                        scrollPositionCurrentAlternate = Velocity.State.scrollAnchor[Velocity.State["scrollProperty" + (scrollDirection === "Left" ? "Top" : "Left")]]; /* GET */

                        /* Unlike $.position(), $.offset() values are relative to the browser window's true dimensions -- not merely its currently viewable area --
                           and therefore end values do not need to be compounded onto current values. */
                        scrollPositionEnd = $(element).offset()[scrollDirection.toLowerCase()] + scrollOffset; /* GET */
                    }

                    /* Since there's only one format that scroll's associated tweensContainer can take, we create it manually. */
                    tweensContainer = {
                        scroll: {
                            rootPropertyValue: false,
                            startValue: scrollPositionCurrent,
                            currentValue: scrollPositionCurrent,
                            endValue: scrollPositionEnd,
                            unitType: "",
                            easing: opts.easing,
                            scrollData: {
                                container: opts.container,
                                direction: scrollDirection,
                                alternateValue: scrollPositionCurrentAlternate
                            }
                        },
                        element: element
                    };

                    if (Velocity.debug) console.log("tweensContainer (scroll): ", tweensContainer.scroll, element);

                /******************************************
                   Tween Data Construction (for Reverse)
                ******************************************/

                /* Reverse acts like a "start" action in that a property map is animated toward. The only difference is
                   that the property map used for reverse is the inverse of the map used in the previous call. Thus, we manipulate
                   the previous call to construct our new map: use the previous map's end values as our new map's start values. Copy over all other data. */
                /* Note: Reverse can be directly called via the "reverse" parameter, or it can be indirectly triggered via the loop option. (Loops are composed of multiple reverses.) */
                /* Note: Reverse calls do not need to be consecutively chained onto a currently-animating element in order to operate on cached values;
                   there is no harm to reverse being called on a potentially stale data cache since reverse's behavior is simply defined
                   as reverting to the element's values as they were prior to the previous *Velocity* call. */
                } else if (action === "reverse") {
                    /* Abort if there is no prior animation data to reverse to. */
                    if (!Data(element).tweensContainer) {
                        /* Dequeue the element so that this queue entry releases itself immediately, allowing subsequent queue entries to run. */
                        $.dequeue(element, opts.queue);

                        return;
                    } else {
                        /*********************
                           Options Parsing
                        *********************/

                        /* If the element was hidden via the display option in the previous call,
                           revert display to "auto" prior to reversal so that the element is visible again. */
                        if (Data(element).opts.display === "none") {
                            Data(element).opts.display = "auto";
                        }

                        if (Data(element).opts.visibility === "hidden") {
                            Data(element).opts.visibility = "visible";
                        }

                        /* If the loop option was set in the previous call, disable it so that "reverse" calls aren't recursively generated.
                           Further, remove the previous call's callback options; typically, users do not want these to be refired. */
                        Data(element).opts.loop = false;
                        Data(element).opts.begin = null;
                        Data(element).opts.complete = null;

                        /* Since we're extending an opts object that has already been extended with the defaults options object,
                           we remove non-explicitly-defined properties that are auto-assigned values. */
                        if (!options.easing) {
                            delete opts.easing;
                        }

                        if (!options.duration) {
                            delete opts.duration;
                        }

                        /* The opts object used for reversal is an extension of the options object optionally passed into this
                           reverse call plus the options used in the previous Velocity call. */
                        opts = $.extend({}, Data(element).opts, opts);

                        /*************************************
                           Tweens Container Reconstruction
                        *************************************/

                        /* Create a deepy copy (indicated via the true flag) of the previous call's tweensContainer. */
                        var lastTweensContainer = $.extend(true, {}, Data(element).tweensContainer);

                        /* Manipulate the previous tweensContainer by replacing its end values and currentValues with its start values. */
                        for (var lastTween in lastTweensContainer) {
                            /* In addition to tween data, tweensContainers contain an element property that we ignore here. */
                            if (lastTween !== "element") {
                                var lastStartValue = lastTweensContainer[lastTween].startValue;

                                lastTweensContainer[lastTween].startValue = lastTweensContainer[lastTween].currentValue = lastTweensContainer[lastTween].endValue;
                                lastTweensContainer[lastTween].endValue = lastStartValue;

                                /* Easing is the only option that embeds into the individual tween data (since it can be defined on a per-property basis).
                                   Accordingly, every property's easing value must be updated when an options object is passed in with a reverse call.
                                   The side effect of this extensibility is that all per-property easing values are forcefully reset to the new value. */
                                if (!Type.isEmptyObject(options)) {
                                    lastTweensContainer[lastTween].easing = opts.easing;
                                }

                                if (Velocity.debug) console.log("reverse tweensContainer (" + lastTween + "): " + JSON.stringify(lastTweensContainer[lastTween]), element);
                            }
                        }

                        tweensContainer = lastTweensContainer;
                    }

                /*****************************************
                   Tween Data Construction (for Start)
                *****************************************/

                } else if (action === "start") {

                    /*************************
                        Value Transferring
                    *************************/

                    /* If this queue entry follows a previous Velocity-initiated queue entry *and* if this entry was created
                       while the element was in the process of being animated by Velocity, then this current call is safe to use
                       the end values from the prior call as its start values. Velocity attempts to perform this value transfer
                       process whenever possible in order to avoid requerying the DOM. */
                    /* If values aren't transferred from a prior call and start values were not forcefed by the user (more on this below),
                       then the DOM is queried for the element's current values as a last resort. */
                    /* Note: Conversely, animation reversal (and looping) *always* perform inter-call value transfers; they never requery the DOM. */
                    var lastTweensContainer;

                    /* The per-element isAnimating flag is used to indicate whether it's safe (i.e. the data isn't stale)
                       to transfer over end values to use as start values. If it's set to true and there is a previous
                       Velocity call to pull values from, do so. */
                    if (Data(element).tweensContainer && Data(element).isAnimating === true) {
                        lastTweensContainer = Data(element).tweensContainer;
                    }

                    /***************************
                       Tween Data Calculation
                    ***************************/

                    /* This function parses property data and defaults endValue, easing, and startValue as appropriate. */
                    /* Property map values can either take the form of 1) a single value representing the end value,
                       or 2) an array in the form of [ endValue, [, easing] [, startValue] ].
                       The optional third parameter is a forcefed startValue to be used instead of querying the DOM for
                       the element's current value. Read Velocity's docmentation to learn more about forcefeeding: VelocityJS.org/#forcefeeding */
                    function parsePropertyValue (valueData, skipResolvingEasing) {
                        var endValue = undefined,
                            easing = undefined,
                            startValue = undefined;

                        /* Handle the array format, which can be structured as one of three potential overloads:
                           A) [ endValue, easing, startValue ], B) [ endValue, easing ], or C) [ endValue, startValue ] */
                        if (Type.isArray(valueData)) {
                            /* endValue is always the first item in the array. Don't bother validating endValue's value now
                               since the ensuing property cycling logic does that. */
                            endValue = valueData[0];

                            /* Two-item array format: If the second item is a number, function, or hex string, treat it as a
                               start value since easings can only be non-hex strings or arrays. */
                            if ((!Type.isArray(valueData[1]) && /^[\d-]/.test(valueData[1])) || Type.isFunction(valueData[1]) || CSS.RegEx.isHex.test(valueData[1])) {
                                startValue = valueData[1];
                            /* Two or three-item array: If the second item is a non-hex string or an array, treat it as an easing. */
                            } else if ((Type.isString(valueData[1]) && !CSS.RegEx.isHex.test(valueData[1])) || Type.isArray(valueData[1])) {
                                easing = skipResolvingEasing ? valueData[1] : getEasing(valueData[1], opts.duration);

                                /* Don't bother validating startValue's value now since the ensuing property cycling logic inherently does that. */
                                if (valueData[2] !== undefined) {
                                    startValue = valueData[2];
                                }
                            }
                        /* Handle the single-value format. */
                        } else {
                            endValue = valueData;
                        }

                        /* Default to the call's easing if a per-property easing type was not defined. */
                        if (!skipResolvingEasing) {
                            easing = easing || opts.easing;
                        }

                        /* If functions were passed in as values, pass the function the current element as its context,
                           plus the element's index and the element set's size as arguments. Then, assign the returned value. */
                        if (Type.isFunction(endValue)) {
                            endValue = endValue.call(element, elementsIndex, elementsLength);
                        }

                        if (Type.isFunction(startValue)) {
                            startValue = startValue.call(element, elementsIndex, elementsLength);
                        }

                        /* Allow startValue to be left as undefined to indicate to the ensuing code that its value was not forcefed. */
                        return [ endValue || 0, easing, startValue ];
                    }

                    /* Cycle through each property in the map, looking for shorthand color properties (e.g. "color" as opposed to "colorRed"). Inject the corresponding
                       colorRed, colorGreen, and colorBlue RGB component tweens into the propertiesMap (which Velocity understands) and remove the shorthand property. */
                    $.each(propertiesMap, function(property, value) {
                        /* Find shorthand color properties that have been passed a hex string. */
                        if (RegExp("^" + CSS.Lists.colors.join("$|^") + "$").test(property)) {
                            /* Parse the value data for each shorthand. */
                            var valueData = parsePropertyValue(value, true),
                                endValue = valueData[0],
                                easing = valueData[1],
                                startValue = valueData[2];

                            if (CSS.RegEx.isHex.test(endValue)) {
                                /* Convert the hex strings into their RGB component arrays. */
                                var colorComponents = [ "Red", "Green", "Blue" ],
                                    endValueRGB = CSS.Values.hexToRgb(endValue),
                                    startValueRGB = startValue ? CSS.Values.hexToRgb(startValue) : undefined;

                                /* Inject the RGB component tweens into propertiesMap. */
                                for (var i = 0; i < colorComponents.length; i++) {
                                    var dataArray = [ endValueRGB[i] ];

                                    if (easing) {
                                        dataArray.push(easing);
                                    }

                                    if (startValueRGB !== undefined) {
                                        dataArray.push(startValueRGB[i]);
                                    }

                                    propertiesMap[property + colorComponents[i]] = dataArray;
                                }

                                /* Remove the intermediary shorthand property entry now that we've processed it. */
                                delete propertiesMap[property];
                            }
                        }
                    });

                    /* Create a tween out of each property, and append its associated data to tweensContainer. */
                    for (var property in propertiesMap) {

                        /**************************
                           Start Value Sourcing
                        **************************/

                        /* Parse out endValue, easing, and startValue from the property's data. */
                        var valueData = parsePropertyValue(propertiesMap[property]),
                            endValue = valueData[0],
                            easing = valueData[1],
                            startValue = valueData[2];

                        /* Now that the original property name's format has been used for the parsePropertyValue() lookup above,
                           we force the property to its camelCase styling to normalize it for manipulation. */
                        property = CSS.Names.camelCase(property);

                        /* In case this property is a hook, there are circumstances where we will intend to work on the hook's root property and not the hooked subproperty. */
                        var rootProperty = CSS.Hooks.getRoot(property),
                            rootPropertyValue = false;

                        /* Other than for the dummy tween property, properties that are not supported by the browser (and do not have an associated normalization) will
                           inherently produce no style changes when set, so they are skipped in order to decrease animation tick overhead.
                           Property support is determined via prefixCheck(), which returns a false flag when no supported is detected. */
                        /* Note: Since SVG elements have some of their properties directly applied as HTML attributes,
                           there is no way to check for their explicit browser support, and so we skip skip this check for them. */
                        if (!Data(element).isSVG && rootProperty !== "tween" && CSS.Names.prefixCheck(rootProperty)[1] === false && CSS.Normalizations.registered[rootProperty] === undefined) {
                            if (Velocity.debug) console.log("Skipping [" + rootProperty + "] due to a lack of browser support.");

                            continue;
                        }

                        /* If the display option is being set to a non-"none" (e.g. "block") and opacity (filter on IE<=8) is being
                           animated to an endValue of non-zero, the user's intention is to fade in from invisible, thus we forcefeed opacity
                           a startValue of 0 if its startValue hasn't already been sourced by value transferring or prior forcefeeding. */
                        if (((opts.display !== undefined && opts.display !== null && opts.display !== "none") || (opts.visibility !== undefined && opts.visibility !== "hidden")) && /opacity|filter/.test(property) && !startValue && endValue !== 0) {
                            startValue = 0;
                        }

                        /* If values have been transferred from the previous Velocity call, extract the endValue and rootPropertyValue
                           for all of the current call's properties that were *also* animated in the previous call. */
                        /* Note: Value transferring can optionally be disabled by the user via the _cacheValues option. */
                        if (opts._cacheValues && lastTweensContainer && lastTweensContainer[property]) {
                            if (startValue === undefined) {
                                startValue = lastTweensContainer[property].endValue + lastTweensContainer[property].unitType;
                            }

                            /* The previous call's rootPropertyValue is extracted from the element's data cache since that's the
                               instance of rootPropertyValue that gets freshly updated by the tweening process, whereas the rootPropertyValue
                               attached to the incoming lastTweensContainer is equal to the root property's value prior to any tweening. */
                            rootPropertyValue = Data(element).rootPropertyValueCache[rootProperty];
                        /* If values were not transferred from a previous Velocity call, query the DOM as needed. */
                        } else {
                            /* Handle hooked properties. */
                            if (CSS.Hooks.registered[property]) {
                               if (startValue === undefined) {
                                    rootPropertyValue = CSS.getPropertyValue(element, rootProperty); /* GET */
                                    /* Note: The following getPropertyValue() call does not actually trigger a DOM query;
                                       getPropertyValue() will extract the hook from rootPropertyValue. */
                                    startValue = CSS.getPropertyValue(element, property, rootPropertyValue);
                                /* If startValue is already defined via forcefeeding, do not query the DOM for the root property's value;
                                   just grab rootProperty's zero-value template from CSS.Hooks. This overwrites the element's actual
                                   root property value (if one is set), but this is acceptable since the primary reason users forcefeed is
                                   to avoid DOM queries, and thus we likewise avoid querying the DOM for the root property's value. */
                                } else {
                                    /* Grab this hook's zero-value template, e.g. "0px 0px 0px black". */
                                    rootPropertyValue = CSS.Hooks.templates[rootProperty][1];
                                }
                            /* Handle non-hooked properties that haven't already been defined via forcefeeding. */
                            } else if (startValue === undefined) {
                                startValue = CSS.getPropertyValue(element, property); /* GET */
                            }
                        }

                        /**************************
                           Value Data Extraction
                        **************************/

                        var separatedValue,
                            endValueUnitType,
                            startValueUnitType,
                            operator = false;

                        /* Separates a property value into its numeric value and its unit type. */
                        function separateValue (property, value) {
                            var unitType,
                                numericValue;

                            numericValue = (value || "0")
                                .toString()
                                .toLowerCase()
                                /* Match the unit type at the end of the value. */
                                .replace(/[%A-z]+$/, function(match) {
                                    /* Grab the unit type. */
                                    unitType = match;

                                    /* Strip the unit type off of value. */
                                    return "";
                                });

                            /* If no unit type was supplied, assign one that is appropriate for this property (e.g. "deg" for rotateZ or "px" for width). */
                            if (!unitType) {
                                unitType = CSS.Values.getUnitType(property);
                            }

                            return [ numericValue, unitType ];
                        }

                        /* Separate startValue. */
                        separatedValue = separateValue(property, startValue);
                        startValue = separatedValue[0];
                        startValueUnitType = separatedValue[1];

                        /* Separate endValue, and extract a value operator (e.g. "+=", "-=") if one exists. */
                        separatedValue = separateValue(property, endValue);
                        endValue = separatedValue[0].replace(/^([+-\/*])=/, function(match, subMatch) {
                            operator = subMatch;

                            /* Strip the operator off of the value. */
                            return "";
                        });
                        endValueUnitType = separatedValue[1];

                        /* Parse float values from endValue and startValue. Default to 0 if NaN is returned. */
                        startValue = parseFloat(startValue) || 0;
                        endValue = parseFloat(endValue) || 0;

                        /***************************************
                           Property-Specific Value Conversion
                        ***************************************/

                        /* Custom support for properties that don't actually accept the % unit type, but where pollyfilling is trivial and relatively foolproof. */
                        if (endValueUnitType === "%") {
                            /* A %-value fontSize/lineHeight is relative to the parent's fontSize (as opposed to the parent's dimensions),
                               which is identical to the em unit's behavior, so we piggyback off of that. */
                            if (/^(fontSize|lineHeight)$/.test(property)) {
                                /* Convert % into an em decimal value. */
                                endValue = endValue / 100;
                                endValueUnitType = "em";
                            /* For scaleX and scaleY, convert the value into its decimal format and strip off the unit type. */
                            } else if (/^scale/.test(property)) {
                                endValue = endValue / 100;
                                endValueUnitType = "";
                            /* For RGB components, take the defined percentage of 255 and strip off the unit type. */
                            } else if (/(Red|Green|Blue)$/i.test(property)) {
                                endValue = (endValue / 100) * 255;
                                endValueUnitType = "";
                            }
                        }

                        /***************************
                           Unit Ratio Calculation
                        ***************************/

                        /* When queried, the browser returns (most) CSS property values in pixels. Therefore, if an endValue with a unit type of
                           %, em, or rem is animated toward, startValue must be converted from pixels into the same unit type as endValue in order
                           for value manipulation logic (increment/decrement) to proceed. Further, if the startValue was forcefed or transferred
                           from a previous call, startValue may also not be in pixels. Unit conversion logic therefore consists of two steps:
                           1) Calculating the ratio of %/em/rem/vh/vw relative to pixels
                           2) Converting startValue into the same unit of measurement as endValue based on these ratios. */
                        /* Unit conversion ratios are calculated by inserting a sibling node next to the target node, copying over its position property,
                           setting values with the target unit type then comparing the returned pixel value. */
                        /* Note: Even if only one of these unit types is being animated, all unit ratios are calculated at once since the overhead
                           of batching the SETs and GETs together upfront outweights the potential overhead
                           of layout thrashing caused by re-querying for uncalculated ratios for subsequently-processed properties. */
                        /* Todo: Shift this logic into the calls' first tick instance so that it's synced with RAF. */
                        function calculateUnitRatios () {

                            /************************
                                Same Ratio Checks
                            ************************/

                            /* The properties below are used to determine whether the element differs sufficiently from this call's
                               previously iterated element to also differ in its unit conversion ratios. If the properties match up with those
                               of the prior element, the prior element's conversion ratios are used. Like most optimizations in Velocity,
                               this is done to minimize DOM querying. */
                            var sameRatioIndicators = {
                                    myParent: element.parentNode || document.body, /* GET */
                                    position: CSS.getPropertyValue(element, "position"), /* GET */
                                    fontSize: CSS.getPropertyValue(element, "fontSize") /* GET */
                                },
                                /* Determine if the same % ratio can be used. % is based on the element's position value and its parent's width and height dimensions. */
                                samePercentRatio = ((sameRatioIndicators.position === callUnitConversionData.lastPosition) && (sameRatioIndicators.myParent === callUnitConversionData.lastParent)),
                                /* Determine if the same em ratio can be used. em is relative to the element's fontSize. */
                                sameEmRatio = (sameRatioIndicators.fontSize === callUnitConversionData.lastFontSize);

                            /* Store these ratio indicators call-wide for the next element to compare against. */
                            callUnitConversionData.lastParent = sameRatioIndicators.myParent;
                            callUnitConversionData.lastPosition = sameRatioIndicators.position;
                            callUnitConversionData.lastFontSize = sameRatioIndicators.fontSize;

                            /***************************
                               Element-Specific Units
                            ***************************/

                            /* Note: IE8 rounds to the nearest pixel when returning CSS values, thus we perform conversions using a measurement
                               of 100 (instead of 1) to give our ratios a precision of at least 2 decimal values. */
                            var measurement = 100,
                                unitRatios = {};

                            if (!sameEmRatio || !samePercentRatio) {
                                var dummy = Data(element).isSVG ? document.createElementNS("http://www.w3.org/2000/svg", "rect") : document.createElement("div");

                                Velocity.init(dummy);
                                sameRatioIndicators.myParent.appendChild(dummy);

                                /* To accurately and consistently calculate conversion ratios, the element's cascaded overflow and box-sizing are stripped.
                                   Similarly, since width/height can be artificially constrained by their min-/max- equivalents, these are controlled for as well. */
                                /* Note: Overflow must be also be controlled for per-axis since the overflow property overwrites its per-axis values. */
                                $.each([ "overflow", "overflowX", "overflowY" ], function(i, property) {
                                    Velocity.CSS.setPropertyValue(dummy, property, "hidden");
                                });
                                Velocity.CSS.setPropertyValue(dummy, "position", sameRatioIndicators.position);
                                Velocity.CSS.setPropertyValue(dummy, "fontSize", sameRatioIndicators.fontSize);
                                Velocity.CSS.setPropertyValue(dummy, "boxSizing", "content-box");

                                /* width and height act as our proxy properties for measuring the horizontal and vertical % ratios. */
                                $.each([ "minWidth", "maxWidth", "width", "minHeight", "maxHeight", "height" ], function(i, property) {
                                    Velocity.CSS.setPropertyValue(dummy, property, measurement + "%");
                                });
                                /* paddingLeft arbitrarily acts as our proxy property for the em ratio. */
                                Velocity.CSS.setPropertyValue(dummy, "paddingLeft", measurement + "em");

                                /* Divide the returned value by the measurement to get the ratio between 1% and 1px. Default to 1 since working with 0 can produce Infinite. */
                                unitRatios.percentToPxWidth = callUnitConversionData.lastPercentToPxWidth = (parseFloat(CSS.getPropertyValue(dummy, "width", null, true)) || 1) / measurement; /* GET */
                                unitRatios.percentToPxHeight = callUnitConversionData.lastPercentToPxHeight = (parseFloat(CSS.getPropertyValue(dummy, "height", null, true)) || 1) / measurement; /* GET */
                                unitRatios.emToPx = callUnitConversionData.lastEmToPx = (parseFloat(CSS.getPropertyValue(dummy, "paddingLeft")) || 1) / measurement; /* GET */

                                sameRatioIndicators.myParent.removeChild(dummy);
                            } else {
                                unitRatios.emToPx = callUnitConversionData.lastEmToPx;
                                unitRatios.percentToPxWidth = callUnitConversionData.lastPercentToPxWidth;
                                unitRatios.percentToPxHeight = callUnitConversionData.lastPercentToPxHeight;
                            }

                            /***************************
                               Element-Agnostic Units
                            ***************************/

                            /* Whereas % and em ratios are determined on a per-element basis, the rem unit only needs to be checked
                               once per call since it's exclusively dependant upon document.body's fontSize. If this is the first time
                               that calculateUnitRatios() is being run during this call, remToPx will still be set to its default value of null,
                               so we calculate it now. */
                            if (callUnitConversionData.remToPx === null) {
                                /* Default to browsers' default fontSize of 16px in the case of 0. */
                                callUnitConversionData.remToPx = parseFloat(CSS.getPropertyValue(document.body, "fontSize")) || 16; /* GET */
                            }

                            /* Similarly, viewport units are %-relative to the window's inner dimensions. */
                            if (callUnitConversionData.vwToPx === null) {
                                callUnitConversionData.vwToPx = parseFloat(window.innerWidth) / 100; /* GET */
                                callUnitConversionData.vhToPx = parseFloat(window.innerHeight) / 100; /* GET */
                            }

                            unitRatios.remToPx = callUnitConversionData.remToPx;
                            unitRatios.vwToPx = callUnitConversionData.vwToPx;
                            unitRatios.vhToPx = callUnitConversionData.vhToPx;

                            if (Velocity.debug >= 1) console.log("Unit ratios: " + JSON.stringify(unitRatios), element);

                            return unitRatios;
                        }

                        /********************
                           Unit Conversion
                        ********************/

                        /* The * and / operators, which are not passed in with an associated unit, inherently use startValue's unit. Skip value and unit conversion. */
                        if (/[\/*]/.test(operator)) {
                            endValueUnitType = startValueUnitType;
                        /* If startValue and endValue differ in unit type, convert startValue into the same unit type as endValue so that if endValueUnitType
                           is a relative unit (%, em, rem), the values set during tweening will continue to be accurately relative even if the metrics they depend
                           on are dynamically changing during the course of the animation. Conversely, if we always normalized into px and used px for setting values, the px ratio
                           would become stale if the original unit being animated toward was relative and the underlying metrics change during the animation. */
                        /* Since 0 is 0 in any unit type, no conversion is necessary when startValue is 0 -- we just start at 0 with endValueUnitType. */
                        } else if ((startValueUnitType !== endValueUnitType) && startValue !== 0) {
                            /* Unit conversion is also skipped when endValue is 0, but *startValueUnitType* must be used for tween values to remain accurate. */
                            /* Note: Skipping unit conversion here means that if endValueUnitType was originally a relative unit, the animation won't relatively
                               match the underlying metrics if they change, but this is acceptable since we're animating toward invisibility instead of toward visibility,
                               which remains past the point of the animation's completion. */
                            if (endValue === 0) {
                                endValueUnitType = startValueUnitType;
                            } else {
                                /* By this point, we cannot avoid unit conversion (it's undesirable since it causes layout thrashing).
                                   If we haven't already, we trigger calculateUnitRatios(), which runs once per element per call. */
                                elementUnitConversionData = elementUnitConversionData || calculateUnitRatios();

                                /* The following RegEx matches CSS properties that have their % values measured relative to the x-axis. */
                                /* Note: W3C spec mandates that all of margin and padding's properties (even top and bottom) are %-relative to the *width* of the parent element. */
                                var axis = (/margin|padding|left|right|width|text|word|letter/i.test(property) || /X$/.test(property) || property === "x") ? "x" : "y";

                                /* In order to avoid generating n^2 bespoke conversion functions, unit conversion is a two-step process:
                                   1) Convert startValue into pixels. 2) Convert this new pixel value into endValue's unit type. */
                                switch (startValueUnitType) {
                                    case "%":
                                        /* Note: translateX and translateY are the only properties that are %-relative to an element's own dimensions -- not its parent's dimensions.
                                           Velocity does not include a special conversion process to account for this behavior. Therefore, animating translateX/Y from a % value
                                           to a non-% value will produce an incorrect start value. Fortunately, this sort of cross-unit conversion is rarely done by users in practice. */
                                        startValue *= (axis === "x" ? elementUnitConversionData.percentToPxWidth : elementUnitConversionData.percentToPxHeight);
                                        break;

                                    case "px":
                                        /* px acts as our midpoint in the unit conversion process; do nothing. */
                                        break;

                                    default:
                                        startValue *= elementUnitConversionData[startValueUnitType + "ToPx"];
                                }

                                /* Invert the px ratios to convert into to the target unit. */
                                switch (endValueUnitType) {
                                    case "%":
                                        startValue *= 1 / (axis === "x" ? elementUnitConversionData.percentToPxWidth : elementUnitConversionData.percentToPxHeight);
                                        break;

                                    case "px":
                                        /* startValue is already in px, do nothing; we're done. */
                                        break;

                                    default:
                                        startValue *= 1 / elementUnitConversionData[endValueUnitType + "ToPx"];
                                }
                            }
                        }

                        /*********************
                           Relative Values
                        *********************/

                        /* Operator logic must be performed last since it requires unit-normalized start and end values. */
                        /* Note: Relative *percent values* do not behave how most people think; while one would expect "+=50%"
                           to increase the property 1.5x its current value, it in fact increases the percent units in absolute terms:
                           50 points is added on top of the current % value. */
                        switch (operator) {
                            case "+":
                                endValue = startValue + endValue;
                                break;

                            case "-":
                                endValue = startValue - endValue;
                                break;

                            case "*":
                                endValue = startValue * endValue;
                                break;

                            case "/":
                                endValue = startValue / endValue;
                                break;
                        }

                        /**************************
                           tweensContainer Push
                        **************************/

                        /* Construct the per-property tween object, and push it to the element's tweensContainer. */
                        tweensContainer[property] = {
                            rootPropertyValue: rootPropertyValue,
                            startValue: startValue,
                            currentValue: startValue,
                            endValue: endValue,
                            unitType: endValueUnitType,
                            easing: easing
                        };

                        if (Velocity.debug) console.log("tweensContainer (" + property + "): " + JSON.stringify(tweensContainer[property]), element);
                    }

                    /* Along with its property data, store a reference to the element itself onto tweensContainer. */
                    tweensContainer.element = element;
                }

                /*****************
                    Call Push
                *****************/

                /* Note: tweensContainer can be empty if all of the properties in this call's property map were skipped due to not
                   being supported by the browser. The element property is used for checking that the tweensContainer has been appended to. */
                if (tweensContainer.element) {
                    /* Apply the "velocity-animating" indicator class. */
                    CSS.Values.addClass(element, "velocity-animating");

                    /* The call array houses the tweensContainers for each element being animated in the current call. */
                    call.push(tweensContainer);

                    /* Store the tweensContainer and options if we're working on the default effects queue, so that they can be used by the reverse command. */
                    if (opts.queue === "") {
                        Data(element).tweensContainer = tweensContainer;
                        Data(element).opts = opts;
                    }

                    /* Switch on the element's animating flag. */
                    Data(element).isAnimating = true;

                    /* Once the final element in this call's element set has been processed, push the call array onto
                       Velocity.State.calls for the animation tick to immediately begin processing. */
                    if (elementsIndex === elementsLength - 1) {
                        /* Add the current call plus its associated metadata (the element set and the call's options) onto the global call container.
                           Anything on this call container is subjected to tick() processing. */
                        Velocity.State.calls.push([ call, elements, opts, null, promiseData.resolver ]);

                        /* If the animation tick isn't running, start it. (Velocity shuts it off when there are no active calls to process.) */
                        if (Velocity.State.isTicking === false) {
                            Velocity.State.isTicking = true;

                            /* Start the tick loop. */
                            tick();
                        }
                    } else {
                        elementsIndex++;
                    }
                }
            }

            /* When the queue option is set to false, the call skips the element's queue and fires immediately. */
            if (opts.queue === false) {
                /* Since this buildQueue call doesn't respect the element's existing queue (which is where a delay option would have been appended),
                   we manually inject the delay property here with an explicit setTimeout. */
                if (opts.delay) {
                    setTimeout(buildQueue, opts.delay);
                } else {
                    buildQueue();
                }
            /* Otherwise, the call undergoes element queueing as normal. */
            /* Note: To interoperate with jQuery, Velocity uses jQuery's own $.queue() stack for queuing logic. */
            } else {
                $.queue(element, opts.queue, function(next, clearQueue) {
                    /* If the clearQueue flag was passed in by the stop command, resolve this call's promise. (Promises can only be resolved once,
                       so it's fine if this is repeatedly triggered for each element in the associated call.) */
                    if (clearQueue === true) {
                        if (promiseData.promise) {
                            promiseData.resolver(elements);
                        }

                        /* Do not continue with animation queueing. */
                        return true;
                    }

                    /* This flag indicates to the upcoming completeCall() function that this queue entry was initiated by Velocity.
                       See completeCall() for further details. */
                    Velocity.velocityQueueEntryFlag = true;

                    buildQueue(next);
                });
            }

            /*********************
                Auto-Dequeuing
            *********************/

            /* As per jQuery's $.queue() behavior, to fire the first non-custom-queue entry on an element, the element
               must be dequeued if its queue stack consists *solely* of the current call. (This can be determined by checking
               for the "inprogress" item that jQuery prepends to active queue stack arrays.) Regardless, whenever the element's
               queue is further appended with additional items -- including $.delay()'s or even $.animate() calls, the queue's
               first entry is automatically fired. This behavior contrasts that of custom queues, which never auto-fire. */
            /* Note: When an element set is being subjected to a non-parallel Velocity call, the animation will not begin until
               each one of the elements in the set has reached the end of its individually pre-existing queue chain. */
            /* Note: Unfortunately, most people don't fully grasp jQuery's powerful, yet quirky, $.queue() function.
               Lean more here: http://stackoverflow.com/questions/1058158/can-somebody-explain-jquery-queue-to-me */
            if ((opts.queue === "" || opts.queue === "fx") && $.queue(element)[0] !== "inprogress") {
                $.dequeue(element);
            }
        }

        /**************************
           Element Set Iteration
        **************************/

        /* If the "nodeType" property exists on the elements variable, we're animating a single element.
           Place it in an array so that $.each() can iterate over it. */
        $.each(elements, function(i, element) {
            /* Ensure each element in a set has a nodeType (is a real element) to avoid throwing errors. */
            if (Type.isNode(element)) {
                processElement.call(element);
            }
        });

        /******************
           Option: Loop
        ******************/

        /* The loop option accepts an integer indicating how many times the element should loop between the values in the
           current call's properties map and the element's property values prior to this call. */
        /* Note: The loop option's logic is performed here -- after element processing -- because the current call needs
           to undergo its queue insertion prior to the loop option generating its series of constituent "reverse" calls,
           which chain after the current call. Two reverse calls (two "alternations") constitute one loop. */
        var opts = $.extend({}, Velocity.defaults, options),
            reverseCallsCount;

        opts.loop = parseInt(opts.loop);
        reverseCallsCount = (opts.loop * 2) - 1;

        if (opts.loop) {
            /* Double the loop count to convert it into its appropriate number of "reverse" calls.
               Subtract 1 from the resulting value since the current call is included in the total alternation count. */
            for (var x = 0; x < reverseCallsCount; x++) {
                /* Since the logic for the reverse action occurs inside Queueing and therefore this call's options object
                   isn't parsed until then as well, the current call's delay option must be explicitly passed into the reverse
                   call so that the delay logic that occurs inside *Pre-Queueing* can process it. */
                var reverseOptions = {
                    delay: opts.delay,
                    progress: opts.progress
                };

                /* If a complete callback was passed into this call, transfer it to the loop redirect's final "reverse" call
                   so that it's triggered when the entire redirect is complete (and not when the very first animation is complete). */
                if (x === reverseCallsCount - 1) {
                    reverseOptions.display = opts.display;
                    reverseOptions.visibility = opts.visibility;
                    reverseOptions.complete = opts.complete;
                }

                animate(elements, "reverse", reverseOptions);
            }
        }

        /***************
            Chaining
        ***************/

        /* Return the elements back to the call chain, with wrapped elements taking precedence in case Velocity was called via the $.fn. extension. */
        return getChain();
    };

    /* Turn Velocity into the animation function, extended with the pre-existing Velocity object. */
    Velocity = $.extend(animate, Velocity);
    /* For legacy support, also expose the literal animate method. */
    Velocity.animate = animate;

    /**************
        Timing
    **************/

    /* Ticker function. */
    var ticker = window.requestAnimationFrame || rAFShim;

    /* Inactive browser tabs pause rAF, which results in all active animations immediately sprinting to their completion states when the tab refocuses.
       To get around this, we dynamically switch rAF to setTimeout (which the browser *doesn't* pause) when the tab loses focus. We skip this for mobile
       devices to avoid wasting battery power on inactive tabs. */
    /* Note: Tab focus detection doesn't work on older versions of IE, but that's okay since they don't support rAF to begin with. */
    if (!Velocity.State.isMobile && document.hidden !== undefined) {
        document.addEventListener("visibilitychange", function() {
            /* Reassign the rAF function (which the global tick() function uses) based on the tab's focus state. */
            if (document.hidden) {
                ticker = function(callback) {
                    /* The tick function needs a truthy first argument in order to pass its internal timestamp check. */
                    return setTimeout(function() { callback(true) }, 16);
                };

                /* The rAF loop has been paused by the browser, so we manually restart the tick. */
                tick();
            } else {
                ticker = window.requestAnimationFrame || rAFShim;
            }
        });
    }

    /************
        Tick
    ************/

    /* Note: All calls to Velocity are pushed to the Velocity.State.calls array, which is fully iterated through upon each tick. */
    function tick (timestamp) {
        /* An empty timestamp argument indicates that this is the first tick occurence since ticking was turned on.
           We leverage this metadata to fully ignore the first tick pass since RAF's initial pass is fired whenever
           the browser's next tick sync time occurs, which results in the first elements subjected to Velocity
           calls being animated out of sync with any elements animated immediately thereafter. In short, we ignore
           the first RAF tick pass so that elements being immediately consecutively animated -- instead of simultaneously animated
           by the same Velocity call -- are properly batched into the same initial RAF tick and consequently remain in sync thereafter. */
        if (timestamp) {
            /* We ignore RAF's high resolution timestamp since it can be significantly offset when the browser is
               under high stress; we opt for choppiness over allowing the browser to drop huge chunks of frames. */
            var timeCurrent = (new Date).getTime();

            /********************
               Call Iteration
            ********************/

            var callsLength = Velocity.State.calls.length;

            /* To speed up iterating over this array, it is compacted (falsey items -- calls that have completed -- are removed)
               when its length has ballooned to a point that can impact tick performance. This only becomes necessary when animation
               has been continuous with many elements over a long period of time; whenever all active calls are completed, completeCall() clears Velocity.State.calls. */
            if (callsLength > 10000) {
                Velocity.State.calls = compactSparseArray(Velocity.State.calls);
            }

            /* Iterate through each active call. */
            for (var i = 0; i < callsLength; i++) {
                /* When a Velocity call is completed, its Velocity.State.calls entry is set to false. Continue on to the next call. */
                if (!Velocity.State.calls[i]) {
                    continue;
                }

                /************************
                   Call-Wide Variables
                ************************/

                var callContainer = Velocity.State.calls[i],
                    call = callContainer[0],
                    opts = callContainer[2],
                    timeStart = callContainer[3],
                    firstTick = !!timeStart,
                    tweenDummyValue = null;

                /* If timeStart is undefined, then this is the first time that this call has been processed by tick().
                   We assign timeStart now so that its value is as close to the real animation start time as possible.
                   (Conversely, had timeStart been defined when this call was added to Velocity.State.calls, the delay
                   between that time and now would cause the first few frames of the tween to be skipped since
                   percentComplete is calculated relative to timeStart.) */
                /* Further, subtract 16ms (the approximate resolution of RAF) from the current time value so that the
                   first tick iteration isn't wasted by animating at 0% tween completion, which would produce the
                   same style value as the element's current value. */
                if (!timeStart) {
                    timeStart = Velocity.State.calls[i][3] = timeCurrent - 16;
                }

                /* The tween's completion percentage is relative to the tween's start time, not the tween's start value
                   (which would result in unpredictable tween durations since JavaScript's timers are not particularly accurate).
                   Accordingly, we ensure that percentComplete does not exceed 1. */
                var percentComplete = Math.min((timeCurrent - timeStart) / opts.duration, 1);

                /**********************
                   Element Iteration
                **********************/

                /* For every call, iterate through each of the elements in its set. */
                for (var j = 0, callLength = call.length; j < callLength; j++) {
                    var tweensContainer = call[j],
                        element = tweensContainer.element;

                    /* Check to see if this element has been deleted midway through the animation by checking for the
                       continued existence of its data cache. If it's gone, skip animating this element. */
                    if (!Data(element)) {
                        continue;
                    }

                    var transformPropertyExists = false;

                    /**********************************
                       Display & Visibility Toggling
                    **********************************/

                    /* If the display option is set to non-"none", set it upfront so that the element can become visible before tweening begins.
                       (Otherwise, display's "none" value is set in completeCall() once the animation has completed.) */
                    if (opts.display !== undefined && opts.display !== null && opts.display !== "none") {
                        if (opts.display === "flex") {
                            var flexValues = [ "-webkit-box", "-moz-box", "-ms-flexbox", "-webkit-flex" ];

                            $.each(flexValues, function(i, flexValue) {
                                CSS.setPropertyValue(element, "display", flexValue);
                            });
                        }

                        CSS.setPropertyValue(element, "display", opts.display);
                    }

                    /* Same goes with the visibility option, but its "none" equivalent is "hidden". */
                    if (opts.visibility !== undefined && opts.visibility !== "hidden") {
                        CSS.setPropertyValue(element, "visibility", opts.visibility);
                    }

                    /************************
                       Property Iteration
                    ************************/

                    /* For every element, iterate through each property. */
                    for (var property in tweensContainer) {
                        /* Note: In addition to property tween data, tweensContainer contains a reference to its associated element. */
                        if (property !== "element") {
                            var tween = tweensContainer[property],
                                currentValue,
                                /* Easing can either be a pre-genereated function or a string that references a pre-registered easing
                                   on the Velocity.Easings object. In either case, return the appropriate easing *function*. */
                                easing = Type.isString(tween.easing) ? Velocity.Easings[tween.easing] : tween.easing;

                            /******************************
                               Current Value Calculation
                            ******************************/

                            /* If this is the last tick pass (if we've reached 100% completion for this tween),
                               ensure that currentValue is explicitly set to its target endValue so that it's not subjected to any rounding. */
                            if (percentComplete === 1) {
                                currentValue = tween.endValue;
                            /* Otherwise, calculate currentValue based on the current delta from startValue. */
                            } else {
                                var tweenDelta = tween.endValue - tween.startValue;
                                currentValue = tween.startValue + (tweenDelta * easing(percentComplete, opts, tweenDelta));

                                /* If no value change is occurring, don't proceed with DOM updating. */
                                if (!firstTick && (currentValue === tween.currentValue)) {
                                    continue;
                                }
                            }

                            tween.currentValue = currentValue;

                            /* If we're tweening a fake 'tween' property in order to log transition values, update the one-per-call variable so that
                               it can be passed into the progress callback. */ 
                            if (property === "tween") {
                                tweenDummyValue = currentValue;
                            } else {
                                /******************
                                   Hooks: Part I
                                ******************/

                                /* For hooked properties, the newly-updated rootPropertyValueCache is cached onto the element so that it can be used
                                   for subsequent hooks in this call that are associated with the same root property. If we didn't cache the updated
                                   rootPropertyValue, each subsequent update to the root property in this tick pass would reset the previous hook's
                                   updates to rootPropertyValue prior to injection. A nice performance byproduct of rootPropertyValue caching is that
                                   subsequently chained animations using the same hookRoot but a different hook can use this cached rootPropertyValue. */
                                if (CSS.Hooks.registered[property]) {
                                    var hookRoot = CSS.Hooks.getRoot(property),
                                        rootPropertyValueCache = Data(element).rootPropertyValueCache[hookRoot];

                                    if (rootPropertyValueCache) {
                                        tween.rootPropertyValue = rootPropertyValueCache;
                                    }
                                }

                                /*****************
                                    DOM Update
                                *****************/

                                /* setPropertyValue() returns an array of the property name and property value post any normalization that may have been performed. */
                                /* Note: To solve an IE<=8 positioning bug, the unit type is dropped when setting a property value of 0. */
                                var adjustedSetData = CSS.setPropertyValue(element, /* SET */
                                                                           property,
                                                                           tween.currentValue + (parseFloat(currentValue) === 0 ? "" : tween.unitType),
                                                                           tween.rootPropertyValue,
                                                                           tween.scrollData);

                                /*******************
                                   Hooks: Part II
                                *******************/

                                /* Now that we have the hook's updated rootPropertyValue (the post-processed value provided by adjustedSetData), cache it onto the element. */
                                if (CSS.Hooks.registered[property]) {
                                    /* Since adjustedSetData contains normalized data ready for DOM updating, the rootPropertyValue needs to be re-extracted from its normalized form. ?? */
                                    if (CSS.Normalizations.registered[hookRoot]) {
                                        Data(element).rootPropertyValueCache[hookRoot] = CSS.Normalizations.registered[hookRoot]("extract", null, adjustedSetData[1]);
                                    } else {
                                        Data(element).rootPropertyValueCache[hookRoot] = adjustedSetData[1];
                                    }
                                }

                                /***************
                                   Transforms
                                ***************/

                                /* Flag whether a transform property is being animated so that flushTransformCache() can be triggered once this tick pass is complete. */
                                if (adjustedSetData[0] === "transform") {
                                    transformPropertyExists = true;
                                }

                            }
                        }
                    }

                    /****************
                        mobileHA
                    ****************/

                    /* If mobileHA is enabled, set the translate3d transform to null to force hardware acceleration.
                       It's safe to override this property since Velocity doesn't actually support its animation (hooks are used in its place). */
                    if (opts.mobileHA) {
                        /* Don't set the null transform hack if we've already done so. */
                        if (Data(element).transformCache.translate3d === undefined) {
                            /* All entries on the transformCache object are later concatenated into a single transform string via flushTransformCache(). */
                            Data(element).transformCache.translate3d = "(0px, 0px, 0px)";

                            transformPropertyExists = true;
                        }
                    }

                    if (transformPropertyExists) {
                        CSS.flushTransformCache(element);
                    }
                }

                /* The non-"none" display value is only applied to an element once -- when its associated call is first ticked through.
                   Accordingly, it's set to false so that it isn't re-processed by this call in the next tick. */
                if (opts.display !== undefined && opts.display !== "none") {
                    Velocity.State.calls[i][2].display = false;
                }
                if (opts.visibility !== undefined && opts.visibility !== "hidden") {
                    Velocity.State.calls[i][2].visibility = false;
                }

                /* Pass the elements and the timing data (percentComplete, msRemaining, timeStart, tweenDummyValue) into the progress callback. */
                if (opts.progress) {
                    opts.progress.call(callContainer[1],
                                       callContainer[1],
                                       percentComplete,
                                       Math.max(0, (timeStart + opts.duration) - timeCurrent),
                                       timeStart,
                                       tweenDummyValue);
                }

                /* If this call has finished tweening, pass its index to completeCall() to handle call cleanup. */
                if (percentComplete === 1) {
                    completeCall(i);
                }
            }
        }

        /* Note: completeCall() sets the isTicking flag to false when the last call on Velocity.State.calls has completed. */
        if (Velocity.State.isTicking) {
            ticker(tick);
        }
    }

    /**********************
        Call Completion
    **********************/

    /* Note: Unlike tick(), which processes all active calls at once, call completion is handled on a per-call basis. */
    function completeCall (callIndex, isStopped) {
        /* Ensure the call exists. */
        if (!Velocity.State.calls[callIndex]) {
            return false;
        }

        /* Pull the metadata from the call. */
        var call = Velocity.State.calls[callIndex][0],
            elements = Velocity.State.calls[callIndex][1],
            opts = Velocity.State.calls[callIndex][2],
            resolver = Velocity.State.calls[callIndex][4];

        var remainingCallsExist = false;

        /*************************
           Element Finalization
        *************************/

        for (var i = 0, callLength = call.length; i < callLength; i++) {
            var element = call[i].element;

            /* If the user set display to "none" (intending to hide the element), set it now that the animation has completed. */
            /* Note: display:none isn't set when calls are manually stopped (via Velocity("stop"). */
            /* Note: Display gets ignored with "reverse" calls and infinite loops, since this behavior would be undesirable. */
            if (!isStopped && !opts.loop) {
                if (opts.display === "none") {
                    CSS.setPropertyValue(element, "display", opts.display);
                }

                if (opts.visibility === "hidden") {
                    CSS.setPropertyValue(element, "visibility", opts.visibility);
                }
            }

            /* If the element's queue is empty (if only the "inprogress" item is left at position 0) or if its queue is about to run
               a non-Velocity-initiated entry, turn off the isAnimating flag. A non-Velocity-initiatied queue entry's logic might alter
               an element's CSS values and thereby cause Velocity's cached value data to go stale. To detect if a queue entry was initiated by Velocity,
               we check for the existence of our special Velocity.queueEntryFlag declaration, which minifiers won't rename since the flag
               is assigned to jQuery's global $ object and thus exists out of Velocity's own scope. */
            if (opts.loop !== true && ($.queue(element)[1] === undefined || !/\.velocityQueueEntryFlag/i.test($.queue(element)[1]))) {
                /* The element may have been deleted. Ensure that its data cache still exists before acting on it. */
                if (Data(element)) {
                    Data(element).isAnimating = false;
                    /* Clear the element's rootPropertyValueCache, which will become stale. */
                    Data(element).rootPropertyValueCache = {};

                    var transformHAPropertyExists = false;
                    /* If any 3D transform subproperty is at its default value (regardless of unit type), remove it. */
                    $.each(CSS.Lists.transforms3D, function(i, transformName) {
                        var defaultValue = /^scale/.test(transformName) ? 1 : 0,
                            currentValue = Data(element).transformCache[transformName];

                        if (Data(element).transformCache[transformName] !== undefined && new RegExp("^\\(" + defaultValue + "[^.]").test(currentValue)) {
                            transformHAPropertyExists = true;

                            delete Data(element).transformCache[transformName];
                        }
                    });

                    /* Mobile devices have hardware acceleration removed at the end of the animation in order to avoid hogging the GPU's memory. */
                    if (opts.mobileHA) {
                        transformHAPropertyExists = true;
                        delete Data(element).transformCache.translate3d;
                    }

                    /* Flush the subproperty removals to the DOM. */
                    if (transformHAPropertyExists) {
                        CSS.flushTransformCache(element);
                    }

                    /* Remove the "velocity-animating" indicator class. */
                    CSS.Values.removeClass(element, "velocity-animating");
                }
            }

            /*********************
               Option: Complete
            *********************/

            /* Complete is fired once per call (not once per element) and is passed the full raw DOM element set as both its context and its first argument. */
            /* Note: Callbacks aren't fired when calls are manually stopped (via Velocity("stop"). */
            if (!isStopped && opts.complete && !opts.loop && (i === callLength - 1)) {
                /* We throw callbacks in a setTimeout so that thrown errors don't halt the execution of Velocity itself. */
                try {
                    opts.complete.call(elements, elements);
                } catch (error) {
                    setTimeout(function() { throw error; }, 1);
                }
            }

            /**********************
               Promise Resolving
            **********************/

            /* Note: Infinite loops don't return promises. */
            if (resolver && opts.loop !== true) {
                resolver(elements);
            }

            /****************************
               Option: Loop (Infinite)
            ****************************/

            if (Data(element) && opts.loop === true && !isStopped) {
                /* If a rotateX/Y/Z property is being animated to 360 deg with loop:true, swap tween start/end values to enable
                   continuous iterative rotation looping. (Otherise, the element would just rotate back and forth.) */
                $.each(Data(element).tweensContainer, function(propertyName, tweenContainer) {
                    if (/^rotate/.test(propertyName) && parseFloat(tweenContainer.endValue) === 360) {
                        tweenContainer.endValue = 0;
                        tweenContainer.startValue = 360;
                    }

                    if (/^backgroundPosition/.test(propertyName) && parseFloat(tweenContainer.endValue) === 100 && tweenContainer.unitType === "%") {
                        tweenContainer.endValue = 0;
                        tweenContainer.startValue = 100;
                    }
                });

                Velocity(element, "reverse", { loop: true, delay: opts.delay });
            }

            /***************
               Dequeueing
            ***************/

            /* Fire the next call in the queue so long as this call's queue wasn't set to false (to trigger a parallel animation),
               which would have already caused the next call to fire. Note: Even if the end of the animation queue has been reached,
               $.dequeue() must still be called in order to completely clear jQuery's animation queue. */
            if (opts.queue !== false) {
                $.dequeue(element, opts.queue);
            }
        }

        /************************
           Calls Array Cleanup
        ************************/

        /* Since this call is complete, set it to false so that the rAF tick skips it. This array is later compacted via compactSparseArray().
          (For performance reasons, the call is set to false instead of being deleted from the array: http://www.html5rocks.com/en/tutorials/speed/v8/) */
        Velocity.State.calls[callIndex] = false;

        /* Iterate through the calls array to determine if this was the final in-progress animation.
           If so, set a flag to end ticking and clear the calls array. */
        for (var j = 0, callsLength = Velocity.State.calls.length; j < callsLength; j++) {
            if (Velocity.State.calls[j] !== false) {
                remainingCallsExist = true;

                break;
            }
        }

        if (remainingCallsExist === false) {
            /* tick() will detect this flag upon its next iteration and subsequently turn itself off. */
            Velocity.State.isTicking = false;

            /* Clear the calls array so that its length is reset. */
            delete Velocity.State.calls;
            Velocity.State.calls = [];
        }
    }

    /******************
        Frameworks
    ******************/

    /* Both jQuery and Zepto allow their $.fn object to be extended to allow wrapped elements to be subjected to plugin calls.
       If either framework is loaded, register a "velocity" extension pointing to Velocity's core animate() method.  Velocity
       also registers itself onto a global container (window.jQuery || window.Zepto || window) so that certain features are
       accessible beyond just a per-element scope. This master object contains an .animate() method, which is later assigned to $.fn
       (if jQuery or Zepto are present). Accordingly, Velocity can both act on wrapped DOM elements and stand alone for targeting raw DOM elements. */
    global.Velocity = Velocity;

    if (global !== window) {
        /* Assign the element function to Velocity's core animate() method. */
        global.fn.velocity = animate;
        /* Assign the object function's defaults to Velocity's global defaults object. */
        global.fn.velocity.defaults = Velocity.defaults;
    }

    /***********************
       Packaged Redirects
    ***********************/

    /* slideUp, slideDown */
    $.each([ "Down", "Up" ], function(i, direction) {
        Velocity.Redirects["slide" + direction] = function (element, options, elementsIndex, elementsSize, elements, promiseData) {
            var opts = $.extend({}, options),
                begin = opts.begin,
                complete = opts.complete,
                computedValues = { height: "", marginTop: "", marginBottom: "", paddingTop: "", paddingBottom: "" },
                inlineValues = {};

            if (opts.display === undefined) {
                /* Show the element before slideDown begins and hide the element after slideUp completes. */
                /* Note: Inline elements cannot have dimensions animated, so they're reverted to inline-block. */
                opts.display = (direction === "Down" ? (Velocity.CSS.Values.getDisplayType(element) === "inline" ? "inline-block" : "block") : "none");
            }

            opts.begin = function() {
                /* If the user passed in a begin callback, fire it now. */
                begin && begin.call(elements, elements);

                /* Cache the elements' original vertical dimensional property values so that we can animate back to them. */
                for (var property in computedValues) {
                    inlineValues[property] = element.style[property];

                    /* For slideDown, use forcefeeding to animate all vertical properties from 0. For slideUp,
                       use forcefeeding to start from computed values and animate down to 0. */
                    var propertyValue = Velocity.CSS.getPropertyValue(element, property);
                    computedValues[property] = (direction === "Down") ? [ propertyValue, 0 ] : [ 0, propertyValue ];
                }

                /* Force vertical overflow content to clip so that sliding works as expected. */
                inlineValues.overflow = element.style.overflow;
                element.style.overflow = "hidden";
            }

            opts.complete = function() {
                /* Reset element to its pre-slide inline values once its slide animation is complete. */
                for (var property in inlineValues) {
                    element.style[property] = inlineValues[property];
                }

                /* If the user passed in a complete callback, fire it now. */
                complete && complete.call(elements, elements);
                promiseData && promiseData.resolver(elements);
            };

            Velocity(element, computedValues, opts);
        };
    });

    /* fadeIn, fadeOut */
    $.each([ "In", "Out" ], function(i, direction) {
        Velocity.Redirects["fade" + direction] = function (element, options, elementsIndex, elementsSize, elements, promiseData) {
            var opts = $.extend({}, options),
                propertiesMap = { opacity: (direction === "In") ? 1 : 0 },
                originalComplete = opts.complete;

            /* Since redirects are triggered individually for each element in the animated set, avoid repeatedly triggering
               callbacks by firing them only when the final element has been reached. */
            if (elementsIndex !== elementsSize - 1) {
                opts.complete = opts.begin = null;
            } else {
                opts.complete = function() {
                    if (originalComplete) {
                        originalComplete.call(elements, elements);
                    }

                    promiseData && promiseData.resolver(elements);
                }
            }

            /* If a display was passed in, use it. Otherwise, default to "none" for fadeOut or the element-specific default for fadeIn. */
            /* Note: We allow users to pass in "null" to skip display setting altogether. */
            if (opts.display === undefined) {
                opts.display = (direction === "In" ? "auto" : "none");
            }

            Velocity(this, propertiesMap, opts);
        };
    });

    return Velocity;
}((window.jQuery || window.Zepto || window), window, document);
}));

/******************
   Known Issues
******************/

/* The CSS spec mandates that the translateX/Y/Z transforms are %-relative to the element itself -- not its parent.
Velocity, however, doesn't make this distinction. Thus, converting to or from the % unit with these subproperties
will produce an inaccurate conversion value. The same issue exists with the cx/cy attributes of SVG circles and ellipses. */
jadeTemplate = {};
jadeTemplate['nav'] = function template(locals) {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (context) {
buf.push("<div" + (jade.cls(['top-nav',"" + (context) + ""], [null,true])) + "><div class=\"logo\"><a href=\"/\"><img data-src=\"logo-horizontal\" class=\"shadow-icon\"/></a></div><div class=\"nav\"><div class=\"left\"><div class=\"main\"><a href=\"//desktop.nanobox.io\" class=\"desktop\">Desktop</a><a href=\"//nanobox.io/\" class=\"cloud\">Cloud</a></div><div class=\"secondary\"><a href=\"//nanobox.io/pricing\" class=\"cloud-only beta\">Pricing</a><a href=\"//nanobox.io/open-source\" class=\"cloud-only\">Open Source</a><a href=\"//engines.nanobox.io\" class=\"desktop-only\">Engines</a><a href=\"//desktop.nanobox.io/downloads\" class=\"desktop-only\">Download</a><a class=\"more\">More</a></div></div><div class=\"right\"><a href=\"//dashboard.nanobox.io/users/sign_in\" class=\"sign-up\">Login / Register</a></div></div><div id=\"submenu\" class=\"submenu\"><div class=\"categories\"><div class=\"category desktop\"><div class=\"title\">DESKTOP</div><div class=\"links\"><a href=\"//desktop.nanobox.io\">Overview</a><a href=\"//desktop.nanobox.io/downloads\">Download</a><a href=\"//engines.nanobox.io\">Engines</a><a href=\"//docs.nanobox.io\">Docs</a><a href=\"//github.com/nanobox-io?utf8=%E2%9C%93&amp;query=nanobox\">Source Code</a><a href=\"//trello.com/b/4nVFzmNZ/nanobox\">Trello</a></div></div><div class=\"category cloud\"><div class=\"title\">CLOUD</div><div class=\"links\"><a href=\"//nanobox.io\">Overview</a><a href=\"//nanobox.io/open-source\">Open Source</a><a href=\"//docs.nanobox.io/cloud\">Docs</a></div></div><div class=\"category etc\"> <div class=\"title\">etc.</div><div class=\"links\"><a href=\"http://nanopack.io\">Nanopack</a><a href=\"//blog.nanobox.io\">Blog</a><a href=\"//github.com/nanobox-io?utf8=%E2%9C%93&amp;query=nanobox\">Github</a><a href=\"//twitter.com/nanobox_io\">Twitter</a><a href=\"//webchat.freenode.net/?channels=nanobox\">#nanobox (IRC freenode)</a><a href=\"\" class=\"mail\"> </a></div></div></div><div class=\"footer\"><a href=\"#\" class=\"beta\">Sitemap</a><a href=\"//desktop.nanobox.io/legal/\">Legal</a></div></div><div class=\"mobile-trigger\"><div onclick=\" $(&quot;.top-nav&quot;).addClass(&quot;open&quot;); \" class=\"btn mobile-open\"><img data-src=\"mobile-open\" class=\"shadow-icon\"/></div><div onclick=\" $(&quot;.top-nav&quot;).removeClass(&quot;open&quot;); \" class=\"btn mobile-close\"><img data-src=\"mobile-close\" class=\"shadow-icon\"/></div></div></div>");}.call(this,"context" in locals_for_with?locals_for_with.context:typeof context!=="undefined"?context:undefined));;return buf.join("");
};

var NanoTopNav, nbx,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

NanoTopNav = (function() {
  function NanoTopNav($el, context) {
    var $node;
    if (context == null) {
      context = "cloud";
    }
    this.addPointerEvents = __bind(this.addPointerEvents, this);
    this.removePointerEvents = __bind(this.removePointerEvents, this);
    this.mouseout = __bind(this.mouseout, this);
    this.mouseover = __bind(this.mouseover, this);
    $node = $(jadeTemplate['nav']({
      context: context
    }));
    $el.prepend($node);
    $(".main a." + context, $node).addClass('active');
    this.$more = $(".more", $node);
    this.$submenu = $("#submenu", $node);
    this.removePointerEvents();
    this.$more.on('mouseover', this.mouseover);
    this.$submenu.on("mouseover", this.mouseover);
    this.$submenu.on("mouseleave", this.mouseout);
    this.addMailLink($("a.mail", $node));
  }

  NanoTopNav.prototype.mouseover = function(e) {
    this.$more.addClass("pseudo-hover");
    clearTimeout(this.timeout);
    this.isOver = true;
    this.$submenu.addClass("visible");
    return this.addPointerEvents();
  };

  NanoTopNav.prototype.mouseout = function(e) {
    this.$more.removeClass("pseudo-hover");
    this.isOver = false;
    this.$submenu.removeClass("visible");
    return this.timeout = setTimeout(this.removePointerEvents, 200);
  };

  NanoTopNav.prototype.removePointerEvents = function() {
    if (this.isHovering) {
      return;
    }
    return this.$submenu.addClass("no-display");
  };

  NanoTopNav.prototype.addPointerEvents = function() {
    return this.$submenu.removeClass("no-display");
  };

  NanoTopNav.prototype.addMailLink = function($el) {
    return $el.html('hello@nanobox.io').attr({
      href: 'mailto:hello@nanobox.io'
    });
  };

  return NanoTopNav;

})();

if (typeof nbx === "undefined" || nbx === null) {
  nbx = {};
}

nbx.NanoTopNav = NanoTopNav;
