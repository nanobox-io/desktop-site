class Home

  constructor: (@$el) ->
    $("a.demo-video", @$el).on "click", ()=> @playVideo()

  playVideo : () ->
    @$video = $ localJadeTemplates['demo-video']( {} )
    @$el.prepend @$video
    shadowIconsInstance.svgReplaceWithString pxSvgIconString, @$video

    $(".close-video-modal", @$video).on "click", ()=> @closeVideo()
    @$video.on "click", ()=> @closeVideo()

  closeVideo : () -> @$video.remove()

nbx.Home = Home