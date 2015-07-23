class Downloads

  constructor: (@$el) ->
    @checked   = true
    @$miniBtns = $(".download-mini-btns")

    $(".option", @$el).on     "click", (e)=> @toggleCheckbox()
    $(".install", @$el).on    "click", (e)=> @startDownload()
    $(".btn", @$miniBtns).on  "click", (e)=> @osBtnClick  e.currentTarget.getAttribute('data')
    @osBtnClick @detectOs()

  # ------------------------------------ API

  destroy : () ->

  # ------------------------------------ Events

  osBtnClick : (os) ->
    @switchOs os
    $(".btn", @$miniBtns).removeClass "active"
    $(".btn[data='#{os}']", @$miniBtns).addClass "active"



  startDownload : () ->
    console.log "download the #{@os} installer"
    downloadPath = if @checked then @OSinfo[ @os ].fullInstaller else @OSinfo[ @os ].partialInstaller
    console.log downloadPath


  toggleCheckbox : () ->
    if @checked
      $(".checkbox", @$el).removeClass "checked"
      @checked = false
    else
      $(".checkbox", @$el).addClass "checked"
      @checked = true

  # ------------------------------------ Methods

  switchOs : ( os ) ->
    if os == @os
      return

    @os = os
    osData = @OSinfo[ @os ]
    $downloader  = $ '.downloader', @$el
    $descriptions = $ 'descriptions', @$el

    # Title & Icon
    $('.title', $downloader).html osData.title
    $('.icon', $downloader).html "<img class='shadow-icon' data-src='#{@os}' />"
    shadowIconsInstance.svgReplaceWithString pxSvgIconString, $downloader
    # Component sizes
    $('.ubunto-image span', $descriptions).html osData.downloadSizes.ubunto
    $('.nanobox span',      $descriptions).html osData.downloadSizes.nano
    $('.vagrant span',      $descriptions).html osData.downloadSizes.vagrant
    $('.virtual-box span',  $descriptions).html osData.downloadSizes.virtualBox


  detectOs : () ->
    os = "Unknown OS"
    if      ( navigator.appVersion.indexOf("Win")   !=-1 ) then os = "win"
    else if ( navigator.appVersion.indexOf("Mac")   !=-1 ) then os = "mac"
    else if ( navigator.appVersion.indexOf("X11")   !=-1 ) then os = "unx"
    else if ( navigator.appVersion.indexOf("Linux") !=-1 ) then os = "lnx"
    os

  OSinfo : {
    mac:
      title            : "Mac OSX Intel - 1.4 GB"
      fullInstaller    : "/some/path/to/an/installler/mac"
      partialInstaller : "/some/path/to/the/partial/installer"
      downloadSizes    :
        ubunto      : "1.3 GB"
        nano        : "8 GB"
        vagrant     : "81 GB"
        virtualBox  : "81 MB"

    win:
      title            : "Windows - 1.4 GB"
      fullInstaller    : "/some/path/to/an/installler/win"
      partialInstaller : "/some/path/to/the/partial/installer"
      downloadSizes    :
        ubunto      : "1.3 GB"
        nano        : "8 GB"
        vagrant     : "81 GB"
        virtualBox  : "81 MB"

    lnx:
      title            : "Linux - 1.4 GB"
      fullInstaller    : "/some/path/to/an/installler/lnx"
      partialInstaller : "/some/path/to/the/partial/installer"
      downloadSizes    :
        ubunto      : "1.3 GB"
        nano        : "8 GB"
        vagrant     : "81 GB"
        virtualBox  : "81 MB"
  }
nbx.Downloads = Downloads
