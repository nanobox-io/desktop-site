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
    @$el.velocity {opacity:0}, duration:200, complete:()=> @loadPage newPage

  loadPage : (page) ->
    pageData = nbx.Pages.pages[page]

    # @fireGoogleAnalyticsEvent page
    # @scrollToTop()
    @currentPage = page
    @$el.empty()

    $node = $( jadeTemplate[ "pages/"+page ]() )
    @$el.append( $node )

    @currentPageClass?.destroy()
    if pageData.class?
      @currentPageClass = new nbx[pageData.class]($node)

    shadowIconsInstance.svgReplaceWithString pxSvgIconString, $node
    Prism.highlightAll()

    @$el.css opacity:0
    @$el.velocity {opacity:1}, duration:400


nbx.ContentArea = ContentArea
