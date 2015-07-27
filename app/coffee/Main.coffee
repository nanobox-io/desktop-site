class Main

  constructor : ($el) ->
    @build $el

  build : ($el) ->
    @nav      = new nbx.TopNav $el
    @content  = new nbx.ContentArea $(".content-area", $el)
    @window   = new nbx.Window $el
    @removeAlphaContent()

  # Quick way of pulling out conetnt that's not ready for prime time
  removeAlphaContent : () ->
    $('a[data=downloads]', @nav.$node).remove()
    $('a[data=engines]',   @nav.$node).remove()
    $('a.sign-up',         @nav.$node).remove()
    # Wait until home page loads, then remove the content
    setInterval ()=>
      $(".content-area a.download").remove()
      $(".descript a").remove()
      $(".running-commands").remove()
    , 200

nbx = {}
nbx.Main = Main
