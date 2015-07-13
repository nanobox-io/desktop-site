jadeTemplate = {};
jadeTemplate['download-list-link'] = function template(locals) {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (os, version, stability) {
buf.push("<li" + (jade.attr("os", "" + (os) + "", true, false)) + (jade.attr("release", "" + (version) + "", true, false)) + ">" + (jade.escape((jade_interp = version) == null ? '' : jade_interp)) + "\t<span>" + (jade.escape((jade_interp = stability) == null ? '' : jade_interp)) + "</span></li>");}.call(this,"os" in locals_for_with?locals_for_with.os:typeof os!=="undefined"?os:undefined,"version" in locals_for_with?locals_for_with.version:typeof version!=="undefined"?version:undefined,"stability" in locals_for_with?locals_for_with.stability:typeof stability!=="undefined"?stability:undefined));;return buf.join("");
};

jadeTemplate['home'] = function template(locals) {
var buf = [];
var jade_mixins = {};
var jade_interp;

buf.push("<div class=\"home\"><div class=\"main-summary\"><img data-src=\"top-mini-stack\" class=\"shadow-icon\"/><div class=\"info\"><h1>Vagrant + Docker + Engines</h1><h4>Local App Environments -  Automated / Lightweight / Reusable </h4><div class=\"links\"> <a href=\"https://github.com/pagodabox?utf8=%E2%9C%93&amp;query=nanobox\" class=\"github\"><img data-src=\"git\" class=\"shadow-icon\"/><p>Fork me on github</p></a><a href=\"/downloads.html\" class=\"download\"><img data-src=\"download-home\" class=\"shadow-icon\"/><p>Download</p></a><a href=\"//webchat.freenode.net/?channels=nanobox\" target=\"_BLANK\" class=\"irc\"><img data-src=\"irc\" class=\"shadow-icon\"/><p>IRC - #nanobox <span>(freenode)</span></p></a></div></div></div><div class=\"overview\"><div class=\"info\"><div class=\"blurb src-code\"><h2><span>1 </span>App Source Code</h2><p>Focus on coding rather than configuring a local dev environment </p></div><div class=\"blurb engine\"><h2><span>2 </span>Language Engine</h2><p>The engine detects your app type and specifies what services your app needs (ruby, mongo, etc) and how they should be configured.</p></div><div class=\"blurb docker\"><h2><span>3 </span>Docker Containers </h2><p>Containers are configured and initialized. Your code is then built and installed. </p></div><div class=\"blurb vagrant\"><h2><span>4 </span>Vagrant / Virtual Box</h2><p>Your services run in an ultra lightweight Ubuntu virtual \u0003machine (30mb RAM).  \u0003Requests to localhost are \u0003proxied to your app</p></div></div><div class=\"graphic\"><img data-src=\"sandwich\" scalable=\"true\" class=\"shadow-icon\"/></div><a href=\"#\" class=\"fork-me\"><img data-src=\"github\" scalable=\"true\" class=\"shadow-icon\"/></a></div><h1>How it works</h1><div class=\"row first\"><div class=\"descript\"><h2>Initialize nanobox </h2><p>There is no boilerplate configuration to launch your app within nanobox. With Vagrant and VirtualBox already installed, 'nanobox up' will take care of the rest.</p></div><div class=\"visual terminal-init\"><div class=\"code\">nanobox up</div></div></div><div class=\"row\"><div class=\"descript\"><h2><span>1</span>Vagrant initializes</h2><p>Nanobox uses Vagrant to launch a virtual machine running a custom operating system with all the necessary Docker and Nanobox bits installed and running at boot. The Vagrantfile is configured to mount the code directory inside the virtual machine as a shared directory.</p></div><div class=\"visual vagrant-init\"><img data-src=\"vagrant-initializes\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"row\"><div class=\"descript\"><h2><span>2</span>Nanobox daemon initializes</h2><p>After the virtual machine boots, a Nanobox api daemon is spawned and waits to receive commands from the nanobox client.</p></div><div class=\"visual nanobox-daemon\"><img data-src=\"nanobox-initializes\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"row\"><div class=\"descript\"><h2><span>3</span>A build container is launched and your Code is copied into the container</h2><p>The client tells the api daemon to start a deploy process which launches a Docker container used to build, prepare, and package your code. Once the container is up and running, the code from your workstation is rsync’d into the container. Copying the code prevents the build process from modifying your codebase directly.</p></div><div class=\"visual vagrant-init\"><img data-src=\"build-cont-launches\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"row\"><div class=\"descript\"><h2><span>4</span>Each language engine sniffs the code looking for a positive match to determine which language your app is written in</h2><p>A registry of build engines sniff your code base to find a familiar match. Each engine looks for indicators within your code, such as file extensions or known files, to help identify language and runtime compatibility such as ruby, python, nodejs, etc.</p></div><div class=\"visual engine-sniff\"><img data-src=\"engine-sniff\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"row\"><div class=\"descript\"><h2><span>5</span>Each of the matched engine’s plug-ins sniffs your code to determine which framework the app is using</h2><p>With the language determined and the engine selected, a registry of engine plugins sniff your code to determine if you are using a known framework. If a plugin is able to identify a known framework, the build process is custom-tailored to optimally configure the environment for that framework.</p></div><div class=\"visual framework-sniff\"><img data-src=\"framework-sniff\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"row\"><div class=\"descript\"><h2><span>6</span>The matched engine and plugin generate a Boxfile defining the services your app needs to run and how each should be configured</h2><p>The engine and engine plugin work together to determine which services your app depends on. The plugin can analyze the codebase to determine dependencies, or it might already know what is needed. As service dependencies are determined, a Boxfile is generated that informs Nanobox which services to launch and how to configure them. These services might include redis, postgres, memcache, mysql, or other data-specific services.</p></div><div class=\"visual boxfile\"><img data-src=\"boxfile\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"row\"><div class=\"descript\"><h2><span>7</span>Nanobox launches and configures Docker containers specified in the Boxfile</h2><p>The Boxfile in the codebase and the Boxfile from the engine plugin are merged. Nanobox launches and configures a Docker container for each service specified in the merged Boxfile. Nanobox overlays a private network with custom IP addresses on a native tcp stack through which the containers can communicate.</p></div><div class=\"visual launch-containers\"><img data-src=\"docker-containers\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"row\"><div class=\"descript\"><h2><span>8</span>Code is built and installed into code containers and the build container is decommissioned</h2><p>In the build container, your code is compiled and prepared to run. The engine and plugin generate or modify config files that allow your app to communicate with the provisioned services. In some cases, the engine or plugin will modify source code, if necessary, to adjust service connection details or ensure a legacy app is suited for a distributed architecture. With the build complete, the output is dropped into another container which runs your app.</p></div><div class=\"visual build-code\"><img data-src=\"code-built\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"row\"><div class=\"descript\"><h2><span>9</span>A router is launched to proxy localhost requests to your app</h2><p>A router is launched to proxy requests from your workstation into the container hosting your finalized app. For simplicity, a DNS entry is added to your workstation.  Your app is launched and ready for development iteration.</p></div><div class=\"visual router\"><img data-src=\"proxy-router\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"row\"><div class=\"descript\"><h2><span>10</span>If files are watched, local saves will run steps 3-9 automatically</h2><p>With your development environment up and running, you can refresh the build at any time. If you started your Nanobox with --watch, any file changes within your code will automatically trigger a rebuild. After the initial build, assets are cached between deploys making subsequent builds really quick.</p></div><div class=\"visual watch\"><img data-src=\"watched-files\" scalable=\"true\" class=\"shadow-icon\"/></div></div><h1>Push to Production <span>(optional)</span></h1><div class=\"row first\"><div class=\"descript\"><h2>Push to Pagoda Box or any other service that supports the nanobox protocol </h2><p>With your development environment up and running, you can refresh the build at any time. If you started your Nanobox with --watch, any file changes within your code will automatically trigger a rebuild. After the initial build, assets are cached between deploys making subsequent builds really quick.</p></div><div class=\"visual\"><img data-src=\"push-pagoda\" scalable=\"true\" class=\"shadow-icon\"/></div></div><div class=\"languages-and-frameworks\"><div class=\"section-header\"><img data-src=\"mad-scientist\" class=\"shadow-icon\"/><h1>Language and Framework Developers</h1></div><h1>Plugins : Add support for your framework</h1><div class=\"row plugin-overview\"><div class=\"graphic\"><img data-src=\"plugin-scripts\" class=\"shadow-icon\"/></div><div class=\"descript\"><h3>It’s your framework, you define the ideal runtime</h3><p>Plugins customize the environment and launch services. You specify the services your framework needs and how they should be configured so the dev can begin building their app immediately with no need to install or configure anything.</p></div></div><div class=\"scripts\"><div class=\"script\"><h3 class=\"required\">sniff</h3><div class=\"row\"><p class=\"descript\">This script crawls the user’s code looking for patterns unique to your framework. If a positive match is found, this script should returns true. </p><div class=\"script\"><pre><code class=\"language-javascript\">#!/bin/sh\nif ( match_file( \"/mage.php\" )) {\n  print true;\n} else {\n  print false;\n}</code></pre></div></div></div><div class=\"script\"><h3>boxfile</h3><div class=\"row\"><p class=\"descript\">Set any boxfile settings your framework needs such as instantiating webs, databases, and caching services. </p><div class=\"script\"><pre><code class=\"language-yaml\">nanobox:\n  domain: localhost\n  port: 4321\n  \nweb1:\n  name: site\n  type: ruby\n  \ndatabase1:\n  name: customers\n  type: postgresql</code></pre></div></div></div><div class=\"script\"><h3>prepare</h3><div class=\"row\"><p class=\"descript\">Set any boxfile settings your framework needs such as instantiating webs, databases, and caching services. </p><div class=\"script\"><pre><code class=\"language-yaml\">web1:\n  name: site\n  type: ruby\n  \ndatabase1:\n  name: customers\n  type: postgresql</code></pre></div></div></div><div class=\"script\"><h3 class=\"required\">build</h3><div class=\"row\"><p class=\"descript\">Set any boxfile settings your framework needs such as instantiating webs, databases, and caching services. </p><div class=\"script\"><pre><code class=\"language-yaml\">web1:\n  name: site\n  type: ruby\n  \ndatabase1:\n  name: customers\n  type: postgresql</code></pre></div></div></div><div class=\"script\"><h3>cleanup</h3><div class=\"row\"><p class=\"descript\">Set any boxfile settings your framework needs such as instantiating webs, databases, and caching services. </p><div class=\"script\"><pre><code class=\"language-yaml\">web1:\n  name: site\n  type: ruby\n  \ndatabase1:\n  name: customers\n  type: postgresql</code></pre></div></div></div></div></div></div>");;return buf.join("");
};

var buildOsDownloadLinks, detectOs, downloads, initializeMainDownloadBtns, meta, releases, shadowIcons, stableVersion, switchActiveDownloads;

downloads = {};

meta = {
  mac: {
    title: "Mac OSX Intel"
  },
  win: {
    title: "Windows"
  },
  lnx: {
    title: "Linux"
  }
};

stableVersion = "1.3.4";

releases = {
  "1.4.0": {
    meta: {
      stability: 'nightly'
    },
    mac: {
      meta: {
        title: "Some other title"
      },
      full: {
        "32": {
          url: "#",
          mb: 845
        },
        "64": {
          url: "#",
          mb: 845
        }
      },
      nano: {
        "32": {
          url: "#",
          mb: 24
        },
        "64": {
          url: "#",
          mb: 24
        }
      }
    },
    win: {
      full: {
        "32": {
          url: "#",
          mb: 845
        },
        "64": {
          url: "#",
          mb: 845
        }
      },
      nano: {
        "32": {
          url: "#",
          mb: 24
        },
        "64": {
          url: "#",
          mb: 24
        }
      }
    },
    lnx: {
      full: {
        "32": {
          url: "#",
          mb: 845
        },
        "64": {
          url: "#",
          mb: 845
        }
      },
      nano: {
        "32": {
          url: "#",
          mb: 24
        },
        "64": {
          url: "#",
          mb: 24
        }
      }
    }
  },
  "1.3.9": {
    meta: {
      stability: 'beta'
    },
    mac: {
      full: {
        "32": {
          url: "#",
          mb: 845
        },
        "64": {
          url: "#",
          mb: 845
        }
      },
      nano: {
        "32": {
          url: "#",
          mb: 24
        },
        "64": {
          url: "#",
          mb: 24
        }
      }
    },
    win: {
      full: {
        "32": {
          url: "#",
          mb: 845
        },
        "64": {
          url: "#",
          mb: 845
        }
      },
      nano: {
        "32": {
          url: "#",
          mb: 24
        },
        "64": {
          url: "#",
          mb: 24
        }
      }
    },
    lnx: {
      full: {
        "32": {
          url: "#",
          mb: 845
        },
        "64": {
          url: "#",
          mb: 845
        }
      },
      nano: {
        "32": {
          url: "#",
          mb: 24
        },
        "64": {
          url: "#",
          mb: 24
        }
      }
    }
  },
  "1.3.4": {
    meta: {
      stability: 'current stable build'
    },
    mac: {
      full: {
        "32": {
          url: "#",
          mb: 845
        },
        "64": {
          url: "#",
          mb: 845
        }
      },
      nano: {
        "32": {
          url: "#",
          mb: 24
        },
        "64": {
          url: "#",
          mb: 24
        }
      }
    },
    win: {
      full: {
        "32": {
          url: "#",
          mb: 845
        },
        "64": {
          url: "#",
          mb: 845
        }
      },
      nano: {
        "32": {
          url: "#",
          mb: 24
        },
        "64": {
          url: "#",
          mb: 24
        }
      }
    },
    lnx: {
      full: {
        "32": {
          url: "#",
          mb: 845
        },
        "64": {
          url: "#",
          mb: 845
        }
      },
      nano: {
        "32": {
          url: "#",
          mb: 24
        },
        "64": {
          url: "#",
          mb: 24
        }
      }
    }
  },
  "1.1.9": {
    meta: {
      stability: 'deprecated'
    },
    mac: {
      full: {
        "32": {
          url: "#",
          mb: 845
        },
        "64": {
          url: "#",
          mb: 845
        }
      },
      nano: {
        "32": {
          url: "#",
          mb: 24
        },
        "64": {
          url: "#",
          mb: 24
        }
      }
    },
    win: {
      full: {
        "32": {
          url: "#",
          mb: 845
        },
        "64": {
          url: "#",
          mb: 845
        }
      },
      nano: {
        "32": {
          url: "#",
          mb: 24
        },
        "64": {
          url: "#",
          mb: 24
        }
      }
    },
    lnx: {
      full: {
        "32": {
          url: "#",
          mb: 845
        },
        "64": {
          url: "#",
          mb: 845
        }
      },
      nano: {
        "32": {
          url: "#",
          mb: 24
        },
        "64": {
          url: "#",
          mb: 24
        }
      }
    }
  }
};

switchActiveDownloads = (function(_this) {
  return function(os, release) {
    $(".btn .title").html(meta[os].title);
    $(".btn .icon").html("<img class='shadow-icon' data-src='" + os + "' scalable='true' />");
    $(".btn .vers").html(release);
    $(".btn[bit='32'][kind='nano'] .down-arrow p").text(releases[release][os]['nano']['32']['mb'] + "MB");
    $(".btn[bit='64'][kind='nano'] .down-arrow p").text(releases[release][os]['nano']['64']['mb'] + "MB");
    $(".btn[bit='32'][kind='full'] .down-arrow p").text(releases[release][os]['full']['32']['mb'] + "MB");
    $(".btn[bit='64'][kind='full'] .down-arrow p").text(releases[release][os]['full']['64']['mb'] + "MB");
    downloads.activeOs = os;
    downloads.activeRelease = release;
    return shadowIconsInstance.svgReplaceWithString(pxSvgIconString, $(".btn"));
  };
})(this);

buildOsDownloadLinks = function() {
  var $lnx, $mac, $node, $os, $win, os, osList, releaseData, releaseId, stability, _results;
  $mac = $(".os-sections .apple ul");
  $win = $(".os-sections .windows ul");
  $lnx = $(".os-sections .linux ul");
  osList = ['mac', 'win', 'lnx'];
  _results = [];
  for (releaseId in releases) {
    releaseData = releases[releaseId];
    _results.push((function() {
      var _i, _len, _results1;
      _results1 = [];
      for (_i = 0, _len = osList.length; _i < _len; _i++) {
        os = osList[_i];
        stability = releaseData.meta.stability === "deprecated" ? "" : "(" + releaseData.meta.stability + ")";
        $node = $(jadeTemplate['download-list-link']({
          version: releaseId,
          stability: stability,
          os: os
        }));
        $os = eval("$" + os);
        $os.append($node);
        _results1.push($node.on("click", (function(_this) {
          return function(e) {
            $('.btn').stop();
            $('.btn').animate({
              opacity: 0
            }, {
              duration: 60,
              complete: function() {
                return $('.btn').animate({
                  opacity: 1
                }, {
                  duration: 300
                });
              }
            });
            $("li.active").removeClass("active");
            $(e.currentTarget).addClass("active");
            return switchActiveDownloads($(e.currentTarget).attr('os'), $(e.currentTarget).attr('release'));
          };
        })(this)));
      }
      return _results1;
    }).call(this));
  }
  return _results;
};

detectOs = function() {
  var os;
  os = "Unknown OS";
  if (navigator.appVersion.indexOf("Win") !== -1) {
    os = "win";
  } else if (navigator.appVersion.indexOf("Mac") !== -1) {
    os = "mac";
  } else if (navigator.appVersion.indexOf("X11") !== -1) {
    os = "unx";
  } else if (navigator.appVersion.indexOf("Linux") !== -1) {
    os = "lnx";
  }
  $("li[os='" + os + "'][release='" + stableVersion + "']").trigger('click');
  return $('.download-btns').css({
    opacity: 1
  });
};

initializeMainDownloadBtns = (function(_this) {
  return function() {
    return $('.btn').on("click", function(e) {
      var bit, kind, url;
      bit = $(e.currentTarget).attr("bit");
      kind = $(e.currentTarget).attr("kind");
      url = releases[downloads.activeRelease][downloads.activeOs][kind][bit]["url"];
      return window.open(url + "?download");
    });
  };
})(this);

shadowIcons = new pxicons.ShadowIcons();

shadowIconsInstance.svgReplaceWithString(pxSvgIconString, $("body"));

buildOsDownloadLinks();

initializeMainDownloadBtns();

detectOs();
