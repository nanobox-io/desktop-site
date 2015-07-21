class ContentArea

  constructor: (@$el) ->
    PubSub.subscribe 'CHANGE_CONTENT', (msg, data)=> @changePage data.pageId

  changePage : (page) ->
    if page == @currentPage || !page? then return
    if @currentPage?
      @unloadCurrentPage page
    else
      @loadPage page

  unloadCurrentPage : (newPage) ->
    @$el.animate {opacity:0}, duration:200, complete:()=> @loadPage newPage

  loadPage : (page) ->
    # @fireGoogleAnalyticsEvent page
    # @scrollToTop()
    @currentPage = page
    @$el.empty()

    $node = $( jadeTemplate[ "pages/"+page ]() )
    @$el.append( $node )

    shadowIconsInstance.svgReplaceWithString pxSvgIconString, $node
    Prism.highlightAll()

    @$el.css opacity:0
    @$el.animate {opacity:1}, duration:400


nbx.ContentArea = ContentArea
