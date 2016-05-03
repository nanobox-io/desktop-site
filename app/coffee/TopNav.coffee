# class TopNav
#
#   constructor: (@$nav) ->
#     $("a.open-community", @$nav).on "click", (e)=>  @showCommunityModal()
#
#     @addCommunityModal(@$nav)
#     @hideCommunityModal()
#
#   activateNavItem : (id) ->
#     $("a[data]", @$nav).removeClass 'active'
#     $("a[data=#{id}]", @$nav).addClass 'active'
#
#   # ------------------------------------ Community Modal
#
#   addCommunityModal : ($el) ->
#     @$community = $ jadeTemplate['community']( {} )
#     $el.append( @$community )
#     castShadows pxSvgIconString, $el
#     $(".close", @$community).on   "click", (e) => @hideCommunityModal()
#
#
#   showCommunityModal : () ->
#     @$community.removeClass "hidden"
#     @listenForClickOutsideModal()
#
#
#   hideCommunityModal : () ->
#     @$community.addClass "hidden"
#
#   listenForClickOutsideModal : () ->
#     $(document).on "mousedown", (e)=>
#       if !@$community.is(e.target) && @$community.has(e.target).length == 0
#         @hideCommunityModal()
#         $(document).off "mousedown"
#
#
# nbx.TopNav = TopNav
