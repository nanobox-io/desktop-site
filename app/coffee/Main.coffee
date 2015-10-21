class Main

  constructor : ($el) ->
    # @nav = new nbx.TopNav $el
    topnav       = new nbx.NanoTopNav $(".nav-holder", $el)

    # @removeAlphaContent()

  # Quick way of pulling out conetnt that's not ready for prime time
  removeAlphaContent : () ->
    # $('a[data=downloads]', @nav.$node).remove()
    # $('a[href="/engines"]',   @nav.$node).remove()
    # $('a.sign-up',         @nav.$node).remove()
    # Wait until home page loads, then remove the content
    setInterval ()=>
      # $(".content-area a.download").remove()
      $(".descript a").remove()
      $(".running-commands").remove()
    , 200

if !nbx? then nbx = {}
nbx.Main = Main
