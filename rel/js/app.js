var Main, nbx;

Main = (function() {
  function Main($el) {
    var node;
    node = jadeTemplate['home']({
      message: 'Hello from a jade template'
    });
    $el.append($(node));
    shadowIconsInstance.svgReplaceWithString(pxSvgIconString, $el);
  }

  return Main;

})();

nbx = {};

nbx.Main = Main;

var main, shadowIcons;

shadowIcons = new pxicons.ShadowIcons();

main = new nbx.Main($('.main-wrapper'));
