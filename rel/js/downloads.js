var Downloads;

Downloads = (function() {
  function Downloads($el) {
    this.$el = $el;
    this.checked = true;
    this.$miniBtns = $(".download-mini-btns");
    $(".checker", this.$el).on("click", (function(_this) {
      return function(e) {
        return _this.toggleCheckbox();
      };
    })(this));
    $(".native .install", this.$el).on("click", (function(_this) {
      return function(e) {
        return _this.startDownload();
      };
    })(this));
    $(".binary .install", this.$el).on("click", (function(_this) {
      return function(e) {
        return _this.startDownload(true);
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

  Downloads.prototype.startDownload = function(isBinary) {
    var downloadPath, kind;
    if (isBinary == null) {
      isBinary = false;
    }
    if (isBinary) {
      downloadPath = this.OSinfo[this.os].binaryUrl;
    } else {
      downloadPath = this.checked ? this.OSinfo[this.os].fullInstaller : this.OSinfo[this.os].partialInstaller;
    }
    kind = isBinary != null ? "raw-binary" : "native-installer";
    ga('send', {
      hitType: 'event',
      eventCategory: 'Downloads',
      eventAction: 'download',
      eventLabel: "" + this.os + "+" + kind
    });
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
    var $downloader, $native, osData;
    if (os === this.os) {
      return;
    }
    this.os = os;
    osData = this.OSinfo[this.os];
    $downloader = $('.downloader', this.$el);
    $native = $('.native', this.$el);
    this.$graphic = $('.break', this.$el);
    $('.icon .os', $downloader).html(osData.title);
    $('.icon .img', $downloader).html("<img class='shadow-icon' data-src='" + this.os + "' />");
    this.updateSize($downloader);
    return castShadows($downloader);
  };

  Downloads.prototype.updateSize = function($downloader) {
    var $descriptions, installer, osData;
    installer = this.checked ? 'fullInstaller' : 'partialInstaller';
    osData = this.OSinfo[this.os];
    $descriptions = $('.descriptions', this.$el);
    this.getSizeOfDownload(osData[installer], function(size) {
      $('.native .size', $downloader).html(size.toFixed(1) + "MB");
      $('.ubunto-image span', $descriptions).html(osData.downloadSizes.ubunto);
      $('.nanobox span', $descriptions).html(osData.downloadSizes.nano);
      $('.vagrant span', $descriptions).html(osData.downloadSizes.vagrant);
      return $('.virtual-box span', $descriptions).html(osData.downloadSizes.virtualBox);
    });
    this.getSizeOfDownload(osData['binaryUrl'], function(size) {
      return $('.binary .size', $downloader).html(size.toFixed(1) + "MB");
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
      os = "lnx";
    } else if (navigator.appVersion.indexOf("Linux") !== -1) {
      os = "lnx";
    }
    return os;
  };

  Downloads.prototype.OSinfo = {
    mac: {
      title: "Mac OSX Intel",
      binaryUrl: "https://s3.amazonaws.com/tools.nanobox.io/cli/darwin/amd64/nanobox",
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
      binaryUrl: "https://s3.amazonaws.com/tools.nanobox.io/cli/windows/amd64/nanobox.exe",
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
      binaryUrl: "https://s3.amazonaws.com/tools.nanobox.io/cli/linux/amd64/nanobox",
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
