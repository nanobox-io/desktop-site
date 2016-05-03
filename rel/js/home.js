var Home;

Home = (function() {
  function Home($el) {
    this.$el = $el;
    $("a.demo-video", this.$el).on("click", (function(_this) {
      return function() {
        return _this.playVideo();
      };
    })(this));
  }

  Home.prototype.playVideo = function() {
    this.$video = $(localJadeTemplates['demo-video']({}));
    this.$el.prepend(this.$video);
    castShadows(pxSvgIconString, this.$video);
    $(".close-video-modal", this.$video).on("click", (function(_this) {
      return function() {
        return _this.closeVideo();
      };
    })(this));
    return this.$video.on("click", (function(_this) {
      return function() {
        return _this.closeVideo();
      };
    })(this));
  };

  Home.prototype.closeVideo = function() {
    return this.$video.remove();
  };

  return Home;

})();

nbx.Home = Home;
