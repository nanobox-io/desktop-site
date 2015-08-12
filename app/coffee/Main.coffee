class Main

  constructor : ($el) ->
    @nav = new nbx.TopNav $el
    # @removeAlphaContent()

  # Quick way of pulling out conetnt that's not ready for prime time
  removeAlphaContent : () ->
    # $('a[data=downloads]', @nav.$node).remove()
    $('a[href="/engines.html"]',   @nav.$node).remove()
    $('a.sign-up',         @nav.$node).remove()
    # Wait until home page loads, then remove the content
    setInterval ()=>
      # $(".content-area a.download").remove()
      $(".descript a").remove()
      $(".running-commands").remove()
    , 200

nbx = {}
nbx.Main = Main
