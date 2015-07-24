class Engines

  constructor: (@$el) ->
    $(".search-btn", @$el).on "click", (e)=> @submitSearch()

  submitSearch : () ->
    console.log $(".search input", @$el).val()

  destroy : () ->

nbx.Engines = Engines
