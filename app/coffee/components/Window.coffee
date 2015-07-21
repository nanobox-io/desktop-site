class Window

  constructor: () ->
    @defaultPage = 'home'
    @loadInitialPage()


  # Push a new state to the window
  changePage : (data) ->
    obj = nbx.Pages.pages[data.pageId]
    History.pushState {page:obj.id}, obj.title, "?page=#{obj.id}"


  onWindowStateChange : () =>
    state = History.getState()
    PubSub.publish( 'CHANGE_CONTENT', { pageId:state.data.page })

  loadInitialPage : () ->
    pageId = document.URL.split("?")[1]?.split("=")[1]
    obj = if !pageId? then nbx.Pages.pages[@defaultPage] else nbx.Pages.pages[pageId]

    History.replaceState {page:obj.id}, obj.title, "?page=#{obj.id}"
    @onWindowStateChange()

    PubSub.subscribe 'CHANGE_PAGE', (msg, data)=> @changePage data
    History.Adapter.bind window,'statechange', @onWindowStateChange


    # if true

nbx.Window = Window
