var Main, nbx;

Main = (function() {
  function Main($el) {
    this.build($el);
  }

  Main.prototype.build = function($el) {
    this.nav = new nbx.TopNav($el);
    this.content = new nbx.ContentArea($(".content-area", $el));
    this.window = new nbx.Window($el);
    return this.removeAlphaContent();
  };

  Main.prototype.removeAlphaContent = function() {
    $('a[data=engines]', this.nav.$node).remove();
    $('a.sign-up', this.nav.$node).remove();
    return setInterval((function(_this) {
      return function() {
        $(".descript a").remove();
        return $(".running-commands").remove();
      };
    })(this), 200);
  };

  return Main;

})();

nbx = {};

nbx.Main = Main;

var ContentArea;

ContentArea = (function() {
  function ContentArea($el) {
    this.$el = $el;
    PubSub.subscribe('CHANGE_CONTENT', (function(_this) {
      return function(msg, data) {
        return _this.changePage(data.pageId);
      };
    })(this));
  }

  ContentArea.prototype.changePage = function(page) {
    if (page === this.currentPage || (page == null)) {
      return;
    }
    if (this.currentPage != null) {
      return this.unloadCurrentPage(page);
    } else {
      return this.loadPage(page);
    }
  };

  ContentArea.prototype.unloadCurrentPage = function(newPage) {
    return this.$el.velocity({
      opacity: 0
    }, {
      duration: 200,
      complete: (function(_this) {
        return function() {
          return _this.loadPage(newPage);
        };
      })(this)
    });
  };

  ContentArea.prototype.loadPage = function(page) {
    var $node, pageData, _ref;
    pageData = nbx.Pages.pages[page];
    this.currentPage = page;
    this.$el.empty();
    $node = $(jadeTemplate["pages/" + page]());
    this.$el.append($node);
    if ((_ref = this.currentPageClass) != null) {
      _ref.destroy();
    }
    if (pageData["class"] != null) {
      this.currentPageClass = new nbx[pageData["class"]]($node);
    }
    shadowIconsInstance.svgReplaceWithString(pxSvgIconString, $node);
    Prism.highlightAll();
    this.$el.css({
      opacity: 0
    });
    return this.$el.velocity({
      opacity: 1
    }, {
      duration: 400
    });
  };

  return ContentArea;

})();

nbx.ContentArea = ContentArea;

var Downloads;

Downloads = (function() {
  function Downloads($el) {
    this.$el = $el;
    this.checked = true;
    this.$miniBtns = $(".download-mini-btns");
    $(".option", this.$el).on("click", (function(_this) {
      return function(e) {
        return _this.toggleCheckbox();
      };
    })(this));
    $(".install", this.$el).on("click", (function(_this) {
      return function(e) {
        return _this.startDownload();
      };
    })(this));
    $(".btn", this.$miniBtns).on("click", (function(_this) {
      return function(e) {
        return _this.osBtnClick(e.currentTarget.getAttribute('data'));
      };
    })(this));
    this.osBtnClick(this.detectOs());
  }

  Downloads.prototype.destroy = function() {};

  Downloads.prototype.osBtnClick = function(os) {
    this.switchOs(os);
    $(".btn", this.$miniBtns).removeClass("active");
    return $(".btn[data='" + os + "']", this.$miniBtns).addClass("active");
  };

  Downloads.prototype.startDownload = function() {
    var downloadPath;
    downloadPath = this.checked ? this.OSinfo[this.os].fullInstaller : this.OSinfo[this.os].partialInstaller;
    return window.location = downloadPath;
  };

  Downloads.prototype.toggleCheckbox = function() {
    if (this.checked) {
      $(".checkbox", this.$el).removeClass("checked");
      this.checked = false;
      return this.updateSize();
    } else {
      $(".checkbox", this.$el).addClass("checked");
      this.checked = true;
      return this.updateSize();
    }
  };

  Downloads.prototype.getSizeOfDownload = function(url, cb) {
    var xhr;
    xhr = new XMLHttpRequest();
    xhr.open("HEAD", url, true);
    xhr.onreadystatechange = function() {
      if (this.readyState === this.DONE) {
        return cb(parseInt(xhr.getResponseHeader("Content-Length")) / 1024 / 1024);
      }
    };
    return xhr.send();
  };

  Downloads.prototype.switchOs = function(os) {
    var $downloader, osData;
    if (os === this.os) {
      return;
    }
    this.os = os;
    osData = this.OSinfo[this.os];
    $downloader = $('.downloader', this.$el);
    this.$graphic = $('.break', this.$el);
    $('.title', $downloader).html(osData.title);
    $('.icon', $downloader).html("<img class='shadow-icon' data-src='" + this.os + "' />");
    this.updateSize($downloader);
    return shadowIconsInstance.svgReplaceWithString(pxSvgIconString, $downloader);
  };

  Downloads.prototype.updateSize = function($downloader) {
    var $descriptions, installer, osData;
    installer = this.checked ? 'fullInstaller' : 'partialInstaller';
    osData = this.OSinfo[this.os];
    $descriptions = $('.descriptions', this.$el);
    this.getSizeOfDownload(osData[installer], function(size) {
      $('.title', $downloader).html(osData.title + ' - ' + size.toFixed(1) + "MB");
      $('.ubunto-image span', $descriptions).html(osData.downloadSizes.ubunto);
      $('.nanobox span', $descriptions).html(osData.downloadSizes.nano);
      $('.vagrant span', $descriptions).html(osData.downloadSizes.vagrant);
      return $('.virtual-box span', $descriptions).html(osData.downloadSizes.virtualBox);
    });
    if (this.checked) {
      return this.$graphic.removeClass('partial-download');
    } else {
      return this.$graphic.addClass('partial-download');
    }
  };

  Downloads.prototype.detectOs = function() {
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
    return os;
  };

  Downloads.prototype.OSinfo = {
    mac: {
      title: "Mac OSX Intel",
      partialInstaller: "https://s3.amazonaws.com/tools.nanobox.io/installers/mac/nanobox.dmg",
      fullInstaller: "https://s3.amazonaws.com/tools.nanobox.io/installers/mac/nanobox-bundle.dmg",
      downloadSizes: {
        ubunto: "392 MB",
        nano: "8 MB",
        vagrant: "81 MB",
        virtualBox: "87 MB"
      }
    },
    win: {
      title: "Windows",
      fullInstaller: "https://s3.amazonaws.com/tools.nanobox.io/installers/windows/nanobox-bundle.exe",
      partialInstaller: "https://s3.amazonaws.com/tools.nanobox.io/installers/windows/nanobox.msi",
      downloadSizes: {
        ubunto: "392 MB",
        nano: "8 MB",
        vagrant: "68 MB",
        virtualBox: "63 MB"
      }
    },
    lnx: {
      title: "Linux",
      partialInstaller: "https://s3.amazonaws.com/tools.nanobox.io/installers/linux/nanobox.deb",
      fullInstaller: "https://s3.amazonaws.com/tools.nanobox.io/installers/linux/nanobox-bundle.deb",
      downloadSizes: {
        ubunto: "392 MB",
        nano: "8 MB",
        vagrant: "163 MB",
        virtualBox: "112 MB"
      }
    }
  };

  return Downloads;

})();

nbx.Downloads = Downloads;

var Engines;

Engines = (function() {
  function Engines($el) {
    var $input;
    this.$el = $el;
    $input = $(".search input", this.$el);
    $(".search-btn", this.$el).on("click", (function(_this) {
      return function(e) {
        return _this.submitSearch();
      };
    })(this));
    $input.on('focus', (function(_this) {
      return function() {
        return $input.on("keypress", function(e) {
          if (e.keyCode === 13) {
            return _this.submitSearch();
          }
        });
      };
    })(this));
    $input.on('focusout', (function(_this) {
      return function() {
        return $input.off("keypress");
      };
    })(this));
  }

  Engines.prototype.submitSearch = function() {
    var url;
    url = "//dashboard.nanobox.io/?search=" + ($(".search input", this.$el).val());
    return window.location = url;
  };

  Engines.prototype.destroy = function() {};

  return Engines;

})();

nbx.Engines = Engines;

var Pages;

Pages = (function() {
  function Pages() {}

  Pages.defaultPage = "home";

  Pages.pages = {
    home: {
      id: "home",
      title: "Nanobox"
    },
    engines: {
      id: "engines",
      title: "Nanobox - Engines",
      "class": 'Engines'
    },
    downloads: {
      id: "downloads",
      title: "Nanobox - Downloads",
      "class": 'Downloads'
    },
    legal: {
      id: "legal",
      title: "Nanobox - Legal"
    }
  };

  return Pages;

})();

nbx.Pages = Pages;

var TopNav,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

TopNav = (function() {
  function TopNav($el) {
    this.onLocalNavItemClick = __bind(this.onLocalNavItemClick, this);
    this.$node = $(jadeTemplate['top-nav']());
    $el.prepend(this.$node);
    shadowIconsInstance.svgReplaceWithString(pxSvgIconString, this.$node);
    $("a[data]", this.$node).on("click", this.onLocalNavItemClick);
    $("a.open-community", this.$node).on("click", (function(_this) {
      return function(e) {
        return _this.showCommunityModal();
      };
    })(this));
    this.addCommunityModal($el);
    this.hideCommunityModal();
    PubSub.subscribe('CHANGE_CONTENT', (function(_this) {
      return function(msg, data) {
        return _this.activateNavItem(data.pageId);
      };
    })(this));
  }

  TopNav.prototype.onLocalNavItemClick = function(e) {
    return PubSub.publish('CHANGE_PAGE', {
      pageId: $(e.currentTarget).attr("data")
    });
  };

  TopNav.prototype.activateNavItem = function(id) {
    $("a[data]", this.$node).removeClass('active');
    return $("a[data=" + id + "]", this.$node).addClass('active');
  };

  TopNav.prototype.addCommunityModal = function($el) {
    this.$community = $(jadeTemplate['community']({}));
    $el.append(this.$community);
    shadowIconsInstance.svgReplaceWithString(pxSvgIconString, $el);
    return $(".close", this.$community).on("click", (function(_this) {
      return function(e) {
        return _this.hideCommunityModal();
      };
    })(this));
  };

  TopNav.prototype.showCommunityModal = function() {
    this.$community.removeClass("hidden");
    return this.listenForClickOutsideModal();
  };

  TopNav.prototype.hideCommunityModal = function() {
    return this.$community.addClass("hidden");
  };

  TopNav.prototype.listenForClickOutsideModal = function() {
    return $(document).on("mousedown", (function(_this) {
      return function(e) {
        if (!_this.$community.is(e.target) && _this.$community.has(e.target).length === 0) {
          _this.hideCommunityModal();
          return $(document).off("mousedown");
        }
      };
    })(this));
  };

  return TopNav;

})();

nbx.TopNav = TopNav;

var Window,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

Window = (function() {
  function Window() {
    this.onWindowStateChange = __bind(this.onWindowStateChange, this);
    this.defaultPage = 'home';
    this.loadInitialPage();
  }

  Window.prototype.changePage = function(data) {
    var obj;
    obj = nbx.Pages.pages[data.pageId];
    return History.pushState({
      page: obj.id
    }, obj.title, "?page=" + obj.id);
  };

  Window.prototype.onWindowStateChange = function() {
    var state;
    state = History.getState();
    return PubSub.publish('CHANGE_CONTENT', {
      pageId: state.data.page
    });
  };

  Window.prototype.loadInitialPage = function() {
    var obj, pageId, _ref;
    pageId = (_ref = document.URL.split("?")[1]) != null ? _ref.split("=")[1] : void 0;
    obj = pageId == null ? nbx.Pages.pages[this.defaultPage] : nbx.Pages.pages[pageId];
    History.replaceState({
      page: obj.id
    }, obj.title, "?page=" + obj.id);
    this.onWindowStateChange();
    PubSub.subscribe('CHANGE_PAGE', (function(_this) {
      return function(msg, data) {
        return _this.changePage(data);
      };
    })(this));
    return History.Adapter.bind(window, 'statechange', this.onWindowStateChange);
  };

  return Window;

})();

nbx.Window = Window;

var main, shadowIcons;

shadowIcons = new pxicons.ShadowIcons();

main = new nbx.Main($('.main-wrapper'));
