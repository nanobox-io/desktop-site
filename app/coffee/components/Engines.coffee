class Engines

  constructor: (@$el) ->
    $input = $(".search input", @$el)
    $(".search-btn", @$el).on "click", (e)=> @submitSearch()
    $input.on 'focus', ()=>
      $input.on "keypress", (e)=>
        if (e.keyCode == 13)
          @submitSearch()
    $input.on 'focusout', ()=> $input.off "keypress"


  submitSearch : () ->
    url = "//dashboard.nanobox.io/?search=#{$(".search input", @$el).val()}"
    window.location = url

  destroy : () ->

nbx.Engines = Engines
