class Main

  constructor : ($el) ->
    @build $el

  build : ($el) ->
    @nav      = new nbx.TopNav $el
    @content  = new nbx.ContentArea $(".content-area", $el)
    @window   = new nbx.Window $el

    # PubSub.publish  'CHANGE_CONTENT', { pageId:"home" }


  # constructor : ($el) ->
  #   @main = @
  #   @$node = $ jadeTemplate['home']( {message:'Hello from a jade template'} )
  #   $el.append( @$node )
  #   shadowIconsInstance.svgReplaceWithString pxSvgIconString, $el
  #   $("a.open-community").on "click", (e) => @showCommunity()
  #
  #
  # showCommunity : () ->
  #   if !@community?
  #     @community = new nbx.Community @$node
  #
  #   @community.show()

nbx = {}
nbx.Main = Main
