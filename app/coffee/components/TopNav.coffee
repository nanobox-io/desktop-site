class TopNav

  constructor: ($el) ->
    @$node = $ jadeTemplate['top-nav']()
    $el.prepend( @$node )
    shadowIconsInstance.svgReplaceWithString pxSvgIconString, @$node

    $("a[data]").on "click", @onLocalNavItemClick
    $("a.open-community").on "click", (e)=> @showCommunityModal()

    @addCommunityModal($el)
    @hideCommunityModal()

  onLocalNavItemClick : (e) =>
    PubSub.publish 'CHANGE_PAGE', { pageId: $(e.currentTarget).attr("data") }

  # ------------------------------------ Community Modal

  addCommunityModal : ($el) ->
    @$community = $ jadeTemplate['community']( {} )
    $el.append( @$community )
    shadowIconsInstance.svgReplaceWithString pxSvgIconString, $el
    $(".close", @$community).on   "click", (e) => @hideCommunityModal()

  showCommunityModal : () -> @$community.removeClass "hidden"
  hideCommunityModal : () -> @$community.addClass "hidden"

nbx.TopNav = TopNav
