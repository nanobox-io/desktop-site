class Engines

  constructor: (@$el) ->
    $(".search-btn", @$el).on "click", (e)=> @submitSearch()

  submitSearch : () ->
    url = "//dashboard.nanobox.io/?search=#{$(".search input", @$el).val()}"
    window.location = url

  destroy : () ->

nbx.Engines = Engines
