class Community

  constructor: ($el) ->
    @$node = $ jadeTemplate['community']( {} )
    $el.append( @$node )
    shadowIconsInstance.svgReplaceWithString pxSvgIconString, $el
    $(".close", @$node).on   "click", (e) => @hide()

  show : () -> @$node.removeClass "hidden"
  hide : () -> @$node.addClass "hidden"



nbx.Community = Community
