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
    $('a[data=downloads]', this.nav.$node).remove();
    $('a[data=engines]', this.nav.$node).remove();
    $('a.sign-up', this.nav.$node).remove();
    return setInterval((function(_this) {
      return function() {
        $(".content-area a.download").remove();
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
    console.log("download the " + this.os + " installer");
    downloadPath = this.checked ? this.OSinfo[this.os].fullInstaller : this.OSinfo[this.os].partialInstaller;
    return console.log(downloadPath);
  };

  Downloads.prototype.toggleCheckbox = function() {
    if (this.checked) {
      $(".checkbox", this.$el).removeClass("checked");
      return this.checked = false;
    } else {
      $(".checkbox", this.$el).addClass("checked");
      return this.checked = true;
    }
  };

  Downloads.prototype.switchOs = function(os) {
    var $descriptions, $downloader, osData;
    if (os === this.os) {
      return;
    }
    this.os = os;
    osData = this.OSinfo[this.os];
    $downloader = $('.downloader', this.$el);
    $descriptions = $('descriptions', this.$el);
    $('.title', $downloader).html(osData.title);
    $('.icon', $downloader).html("<img class='shadow-icon' data-src='" + this.os + "' />");
    shadowIconsInstance.svgReplaceWithString(pxSvgIconString, $downloader);
    $('.ubunto-image span', $descriptions).html(osData.downloadSizes.ubunto);
    $('.nanobox span', $descriptions).html(osData.downloadSizes.nano);
    $('.vagrant span', $descriptions).html(osData.downloadSizes.vagrant);
    return $('.virtual-box span', $descriptions).html(osData.downloadSizes.virtualBox);
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
      title: "Mac OSX Intel - 1.4 GB",
      fullInstaller: "/some/path/to/an/installler/mac",
      partialInstaller: "/some/path/to/the/partial/installer",
      downloadSizes: {
        ubunto: "1.3 GB",
        nano: "8 GB",
        vagrant: "81 GB",
        virtualBox: "81 MB"
      }
    },
    win: {
      title: "Windows - 1.4 GB",
      fullInstaller: "/some/path/to/an/installler/win",
      partialInstaller: "/some/path/to/the/partial/installer",
      downloadSizes: {
        ubunto: "1.3 GB",
        nano: "8 GB",
        vagrant: "81 GB",
        virtualBox: "81 MB"
      }
    },
    lnx: {
      title: "Linux - 1.4 GB",
      fullInstaller: "/some/path/to/an/installler/lnx",
      partialInstaller: "/some/path/to/the/partial/installer",
      downloadSizes: {
        ubunto: "1.3 GB",
        nano: "8 GB",
        vagrant: "81 GB",
        virtualBox: "81 MB"
      }
    }
  };

  return Downloads;

})();

nbx.Downloads = Downloads;

var Engines;

Engines = (function() {
  function Engines($el) {
    this.$el = $el;
    $(".search-btn", this.$el).on("click", (function(_this) {
      return function(e) {
        return _this.submitSearch();
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
