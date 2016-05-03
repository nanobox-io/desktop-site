class Downloads

  constructor: (@$el) ->
    @checked   = true
    @$miniBtns = $(".download-mini-btns")

    $(".checker", @$el).on     "click", (e)=> @toggleCheckbox()
    $(".native .install", @$el).on    "click", (e)=> @startDownload()
    $(".binary .install", @$el).on    "click", (e)=> @startDownload(true)
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

  startDownload : (isBinary=false) ->
    if isBinary
      downloadPath = @OSinfo[ @os ].binaryUrl
    else
      downloadPath = if @checked then @OSinfo[ @os ].fullInstaller else @OSinfo[ @os ].partialInstaller

    kind = if isBinary? then "raw-binary" else "native-installer"
    ga 'send',
      hitType       : 'event'
      eventCategory : 'Downloads'
      eventAction   : 'download'
      eventLabel    : "#{@os}+#{kind}"

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
    $native      = $ '.native', @$el
    @$graphic    = $ '.break', @$el

    # Title & Icon
    $('.icon .os', $downloader).html osData.title
    $('.icon .img', $downloader).html "<img class='shadow-icon' data-src='#{@os}' />"

    @updateSize $downloader
    castShadows $downloader

  updateSize : ($downloader) ->
    installer     = if @checked then 'fullInstaller' else 'partialInstaller'
    osData        = @OSinfo[ @os ]
    $descriptions = $ '.descriptions', @$el

    @getSizeOfDownload osData[ installer ], (size)->
      $('.native .size', $downloader).html size.toFixed(1) + "MB"
      # Component sizes
      $('.ubunto-image span', $descriptions).html osData.downloadSizes.ubunto
      $('.nanobox span',      $descriptions).html osData.downloadSizes.nano
      $('.vagrant span',      $descriptions).html osData.downloadSizes.vagrant
      $('.virtual-box span',  $descriptions).html osData.downloadSizes.virtualBox

    @getSizeOfDownload osData[ 'binaryUrl' ], (size)->
      $('.binary .size', $downloader).html size.toFixed(1) + "MB"

    if @checked
      @$graphic.removeClass 'partial-download'
    else
      @$graphic.addClass 'partial-download'


  detectOs : () ->
    os = "Unknown OS"
    if      ( navigator.appVersion.indexOf("Win")   !=-1 ) then os = "win"
    else if ( navigator.appVersion.indexOf("Mac")   !=-1 ) then os = "mac"
    else if ( navigator.appVersion.indexOf("X11")   !=-1 ) then os = "lnx"
    else if ( navigator.appVersion.indexOf("Linux") !=-1 ) then os = "lnx"
    os








  OSinfo : {
    mac:
      title            : "Mac OSX Intel"
      binaryUrl        : "https://s3.amazonaws.com/tools.nanobox.io/cli/darwin/amd64/nanobox"
      partialInstaller : "https://s3.amazonaws.com/tools.nanobox.io/installers/mac/nanobox.dmg"
      fullInstaller    : "https://s3.amazonaws.com/tools.nanobox.io/installers/mac/nanobox-bundle.dmg"
      downloadSizes    :
        ubunto      : "392 MB"
        nano        : "8 MB"
        vagrant     : "81 MB"
        virtualBox  : "87 MB"

    win:
      title            : "Windows"
      binaryUrl        : "https://s3.amazonaws.com/tools.nanobox.io/cli/windows/amd64/nanobox.exe"
      fullInstaller    : "https://s3.amazonaws.com/tools.nanobox.io/installers/windows/nanobox-bundle.exe"
      partialInstaller : "https://s3.amazonaws.com/tools.nanobox.io/installers/windows/nanobox.msi"
      downloadSizes    :
        ubunto      : "392 MB"
        nano        : "8 MB"
        vagrant     : "68 MB"
        virtualBox  : "63 MB"

    lnx:
      title            : "Linux"
      binaryUrl        : "https://s3.amazonaws.com/tools.nanobox.io/cli/linux/amd64/nanobox"
      partialInstaller : "https://s3.amazonaws.com/tools.nanobox.io/installers/linux/nanobox.deb"
      fullInstaller    : "https://s3.amazonaws.com/tools.nanobox.io/installers/linux/nanobox-bundle.deb"
      downloadSizes    :
        ubunto      : "392 MB"
        nano        : "8 MB"
        vagrant     : "163 MB"
        virtualBox  : "112 MB"
  }
nbx.Downloads = Downloads
