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
    url = "//engines.nanobox.io/releases?search=" + ($(".search input", this.$el).val());
    return window.location = url;
  };

  Engines.prototype.destroy = function() {};

  return Engines;

})();

nbx.Engines = Engines;
