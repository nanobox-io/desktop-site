class TopNav

  constructor: ($el) ->
    @$node = $ jadeTemplate['top-nav']()
    $el.prepend( @$node )
    shadowIconsInstance.svgReplaceWithString pxSvgIconString, @$node

    $("a[data]", @$node).on "click", @onLocalNavItemClick
    $("a.open-community", @$node).on "click", (e)=>  @showCommunityModal()

    @addCommunityModal($el)
    @hideCommunityModal()

    PubSub.subscribe 'CHANGE_CONTENT', (msg, data)=> @activateNavItem data.pageId


  onLocalNavItemClick : (e) =>
    PubSub.publish 'CHANGE_PAGE', { pageId: $(e.currentTarget).attr("data") }

  activateNavItem : (id) ->
    $("a[data]", @$node).removeClass 'active'
    $("a[data=#{id}]", @$node).addClass 'active'

  # ------------------------------------ Community Modal

  addCommunityModal : ($el) ->
    @$community = $ jadeTemplate['community']( {} )
    $el.append( @$community )
    shadowIconsInstance.svgReplaceWithString pxSvgIconString, $el
    $(".close", @$community).on   "click", (e) => @hideCommunityModal()


  showCommunityModal : () ->
    @$community.removeClass "hidden"
    @listenForClickOutsideModal()


  hideCommunityModal : () ->
    @$community.addClass "hidden"

  listenForClickOutsideModal : () ->
    $(document).on "mousedown", (e)=>
      if !@$community.is(e.target) && @$community.has(e.target).length == 0
        @hideCommunityModal()
        $(document).off "mousedown"


nbx.TopNav = TopNav
