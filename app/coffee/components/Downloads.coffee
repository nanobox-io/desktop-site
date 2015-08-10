class Downloads

  constructor: (@$el) ->
    @checked   = true
    @$miniBtns = $(".download-mini-btns")

    $(".option", @$el).on     "click", (e)=> @toggleCheckbox()
    $(".install", @$el).on    "click", (e)=> @startDownload()
    $(".btn", @$miniBtns).on  "click", (e)=> @osBtnClick  e.currentTarget.getAttribute('data')
    @osBtnClick @detectOs()
    # @getSizeOfDownload "https://s3.amazonaws.com/tools.nanobox.io/cli/darwin/amd64/nanobox", (size)-> console.log "The size is #{size.toFixed(1)}MB"

  # ------------------------------------ API

  destroy : () ->

  # ------------------------------------ Events

  osBtnClick : (os) ->
    @switchOs os
    $(".btn", @$miniBtns).removeClass "active"
    $(".btn[data='#{os}']", @$miniBtns).addClass "active"



  startDownload : () ->
    downloadPath = if @checked then @OSinfo[ @os ].fullInstaller else @OSinfo[ @os ].partialInstaller
    window.location = downloadPath


  toggleCheckbox : () ->
    if @checked
      $(".checkbox", @$el).removeClass "checked"
      @checked = false
      @updateSize()
    else
      $(".checkbox", @$el).addClass "checked"
      @checked = true
      @updateSize()

  # ------------------------------------ Methods

  getSizeOfDownload : (url, cb) ->
    xhr = new XMLHttpRequest()
    xhr.open "HEAD", url, true

    xhr.onreadystatechange = ()->
      if (this.readyState == this.DONE)
        cb parseInt(xhr.getResponseHeader("Content-Length"))/1024/1024

    xhr.send()

  switchOs : ( os ) ->
    if os == @os
      return

    @os = os
    osData = @OSinfo[ @os ]
    $downloader  = $ '.downloader', @$el

    # Title & Icon
    $('.title', $downloader).html osData.title
    $('.icon', $downloader).html "<img class='shadow-icon' data-src='#{@os}' />"

    @updateSize $downloader

    shadowIconsInstance.svgReplaceWithString pxSvgIconString, $downloader

  updateSize : ($downloader) ->
    installer     = if @checked then 'fullInstaller' else 'partialInstaller'
    osData        = @OSinfo[ @os ]
    $descriptions = $ '.descriptions', @$el

    @getSizeOfDownload osData[ installer ], (size)->
      $('.title', $downloader).html osData.title + ' - ' + size.toFixed(1) + "MB"
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
      title            : "Mac OSX Intel"
      partialInstaller : "https://s3.amazonaws.com/tools.nanobox.io/installers/mac/nanobox.dmg"
      fullInstaller    : "https://s3.amazonaws.com/tools.nanobox.io/installers/mac/nanobox-bundle.dmg"
      downloadSizes    :
        ubunto      : "1.3 GB"
        nano        : "8 GB"
        vagrant     : "81 GB"
        virtualBox  : "76 MB"

    win:
      title            : "Windows"
      fullInstaller    : "https://s3.amazonaws.com/tools.nanobox.io/installers/windows/nanobox-bundle.exe"
      partialInstaller : "https://s3.amazonaws.com/tools.nanobox.io/installers/windows/nanobox.msi"
      downloadSizes    :
        ubunto      : "1.3 GB"
        nano        : "8 GB"
        vagrant     : "81 GB"
        virtualBox  : "81 MB"

    lnx:
      title            : "Linux"
      partialInstaller : "https://s3.amazonaws.com/tools.nanobox.io/installers/linux/nanobox.deb"
      fullInstaller    : "https://s3.amazonaws.com/tools.nanobox.io/installers/linux/nanobox-bundle.deb"
      downloadSizes    :
        ubunto      : "1.3 GB"
        nano        : "8 GB"
        vagrant     : "81 GB"
        virtualBox  : "81 MB"
  }
nbx.Downloads = Downloads
