class Downloads

  constructor: (@$el) ->
    @checked = true
    $(".option", @$el).on "click", ()=> @toggleCheckbox()
    @switchOs @detectOs()

  # ------------------------------------ API

  destroy : () ->

  # ------------------------------------ Events

  toggleCheckbox : () ->
    if @checked
      $(".checkbox", @$el).removeClass "checked"
      @checked = false
    else
      $(".checkbox", @$el).addClass "checked"
      @checked = true

  # ------------------------------------ Methods

  switchOs : ( os ) ->
    os = 'win'
    osData = @OSinfo[os]
    $downloader = $ '.downloader', @$el
    $('.title', $downloader).html osData.title
    $('.icon', $downloader).html "<img class='shadow-icon' data-src='#{os}' />"
    shadowIconsInstance.svgReplaceWithString pxSvgIconString, $downloader


  detectOs : () ->
    os = "Unknown OS"
    if      ( navigator.appVersion.indexOf("Win")   !=-1 ) then os = "win"
    else if ( navigator.appVersion.indexOf("Mac")   !=-1 ) then os = "mac"
    else if ( navigator.appVersion.indexOf("X11")   !=-1 ) then os = "unx"
    else if ( navigator.appVersion.indexOf("Linux") !=-1 ) then os = "lnx"
    os

  OSinfo : {
    mac:
      title:      "Mac OSX Intel - 1.4 GB"
      installer:  "/some/path/to/an/installler"
      downloadSizes:
        ubunto:     "1.3 GB"
        nano:       "8 GB"
        vagrant:    "81 GB"
        virtualBox: "81 MB"

    win:
      title:      "Windows - 1.4 GB"
      installer:  "/some/path/to/an/installler"
      downloadSizes:
        ubunto:     "1.3 GB"
        nano:       "8 GB"
        vagrant:    "81 GB"
        virtualBox: "81 MB"

    lnx:
      title:      "Linux - 1.4 GB"
      installer:  "/some/path/to/an/installler"
      downloadSizes:
        ubunto:     "1.3 GB"
        nano:       "8 GB"
        vagrant:    "81 GB"
        virtualBox: "81 MB"
  }
nbx.Downloads = Downloads
