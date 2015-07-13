downloads = {}

# OS descriptors
meta = {
  mac : { title:"Mac OSX Intel" }
  win : { title:"Windows" }
  lnx : { title:"Linux" }
}

# Current Stable Version
stableVersion = "1.3.4"

# All the available releases
releases = {
  "1.4.0": {
    meta   : { stability:'nightly'}
    mac    : {
      meta : { title:"Some other title" }
      full : { "32":{ url:"#", mb:845 }, "64":{ url:"#", mb:845 } }
      nano : { "32":{ url:"#", mb:24 },  "64":{ url:"#", mb:24 } }
    }
    win    : {
      full : { "32":{ url:"#", mb:845 }, "64":{ url:"#", mb:845 } }
      nano : { "32":{ url:"#", mb:24 },  "64":{ url:"#", mb:24 } }
    }
    lnx    : {
      full : { "32":{ url:"#", mb:845 }, "64":{ url:"#", mb:845 } }
      nano : { "32":{ url:"#", mb:24 },  "64":{ url:"#", mb:24 } }
    }
  }
  "1.3.9": {
    meta   : { stability:'beta'}
    mac    : {
      full : { "32":{ url:"#", mb:845 }, "64":{ url:"#", mb:845 } }
      nano : { "32":{ url:"#", mb:24 },  "64":{ url:"#", mb:24 } }
    }
    win    : {
      full : { "32":{ url:"#", mb:845 }, "64":{ url:"#", mb:845 } }
      nano : { "32":{ url:"#", mb:24 },  "64":{ url:"#", mb:24 } }
    }
    lnx    : {
      full : { "32":{ url:"#", mb:845 }, "64":{ url:"#", mb:845 } }
      nano : { "32":{ url:"#", mb:24 },  "64":{ url:"#", mb:24 } }
    }
  }
  "1.3.4": {
    meta   : { stability:'current stable build'}
    mac    : {
      full : { "32":{ url:"#", mb:845 }, "64":{ url:"#", mb:845 } }
      nano : { "32":{ url:"#", mb:24 },  "64":{ url:"#", mb:24 } }
    }
    win    : {
      full : { "32":{ url:"#", mb:845 }, "64":{ url:"#", mb:845 } }
      nano : { "32":{ url:"#", mb:24 },  "64":{ url:"#", mb:24 } }
    }
    lnx    : {
      full : { "32":{ url:"#", mb:845 }, "64":{ url:"#", mb:845 } }
      nano : { "32":{ url:"#", mb:24 },  "64":{ url:"#", mb:24 } }
    }
  }
  "1.1.9": {
    meta   : { stability:'deprecated'}
    mac    : {
      full : { "32":{ url:"#", mb:845 }, "64":{ url:"#", mb:845 } }
      nano : { "32":{ url:"#", mb:24 },  "64":{ url:"#", mb:24 } }
    }
    win    : {
      full : { "32":{ url:"#", mb:845 }, "64":{ url:"#", mb:845 } }
      nano : { "32":{ url:"#", mb:24 },  "64":{ url:"#", mb:24 } }
    }
    lnx    : {
      full : { "32":{ url:"#", mb:845 }, "64":{ url:"#", mb:845 } }
      nano : { "32":{ url:"#", mb:24 },  "64":{ url:"#", mb:24 } }
    }
  }
}
switchActiveDownloads = (os, release) =>
  $(".btn .title").html meta[os].title
  $(".btn .icon").html  "<img class='shadow-icon' data-src='#{os}' scalable='true' />"
  $(".btn .vers").html release

  $(".btn[bit='32'][kind='nano'] .down-arrow p").text releases[release][os]['nano']['32']['mb'] + "MB"
  $(".btn[bit='64'][kind='nano'] .down-arrow p").text releases[release][os]['nano']['64']['mb'] + "MB"
  $(".btn[bit='32'][kind='full'] .down-arrow p").text releases[release][os]['full']['32']['mb'] + "MB"
  $(".btn[bit='64'][kind='full'] .down-arrow p").text releases[release][os]['full']['64']['mb'] + "MB"

  downloads.activeOs      = os
  downloads.activeRelease = release
  shadowIconsInstance.svgReplaceWithString pxSvgIconString, $(".btn")

buildOsDownloadLinks = ()->
  $mac = $(".os-sections .apple ul")
  $win = $(".os-sections .windows ul")
  $lnx = $(".os-sections .linux ul")

  osList = ['mac','win','lnx']

  for releaseId, releaseData of releases
    for os in osList
      stability = if releaseData.meta.stability == "deprecated" then "" else "(#{releaseData.meta.stability})"
      $node = $ jadeTemplate['download-list-link']( {version:releaseId, stability:stability, os:os } )
      $os = eval "$" + os
      $os.append $node
      $node.on "click", (e)=>
        $('.btn').stop()
        $('.btn').animate {opacity:0}, duration:60, complete:()->
          $('.btn').animate {opacity:1}, {duration:300}

        $("li.active").removeClass  "active"
        $(e.currentTarget).addClass "active"
        switchActiveDownloads $(e.currentTarget).attr('os'), $(e.currentTarget).attr('release')

detectOs = () ->
  os = "Unknown OS"
  if      ( navigator.appVersion.indexOf("Win")   !=-1 ) then os = "win"
  else if ( navigator.appVersion.indexOf("Mac")   !=-1 ) then os = "mac"
  else if ( navigator.appVersion.indexOf("X11")   !=-1 ) then os = "unx"
  else if ( navigator.appVersion.indexOf("Linux") !=-1 ) then os = "lnx"
  $("li[os='#{os}'][release='#{stableVersion}']").trigger('click')
  $('.download-btns').css opacity:1

initializeMainDownloadBtns = () =>
  $('.btn').on "click", (e)=>
    bit  = $(e.currentTarget).attr "bit"
    kind = $(e.currentTarget).attr "kind"
    url  = releases[downloads.activeRelease][downloads.activeOs][kind][bit]["url"]
    window.open(url+"?download")

temporarilyHideInactiveFeatures = () ->
  $(".os-sections").css   display:'none'
  $(".btn[bit='32']").css display:'none'


shadowIcons = new pxicons.ShadowIcons()
shadowIconsInstance.svgReplaceWithString pxSvgIconString, $("body")

buildOsDownloadLinks()
initializeMainDownloadBtns()
detectOs()
temporarilyHideInactiveFeatures()
