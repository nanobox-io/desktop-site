class Main

  constructor : ($el) ->
    node = jadeTemplate['home']( {message:'Hello from a jade template'} )
    $el.append( $(node) )

    shadowIconsInstance.svgReplaceWithString pxSvgIconString, $el


nbx = {}
nbx.Main = Main
