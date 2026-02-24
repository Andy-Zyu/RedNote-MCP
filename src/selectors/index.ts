/**
 * Centralized DOM selectors for Xiaohongshu (RedNote).
 * Grouped by feature area. Use `as const` for type safety.
 */

export const SELECTORS = {
  auth: {
    sidebarUser: '.user.side-bar-component .channel',
    loginContainer: '.login-container',
    qrCodeImage: '.qrcode-img',
  },

  search: {
    feedsContainer: '.feeds-container',
    noteItem: '.feeds-container .note-item',
    coverLink: 'a.cover.mask.ld',
    noteContainer: '#noteContainer',
    detailTitle: '#detail-title',
    detailDesc: '#detail-desc .note-text',
    authorWrapper: '.author-wrapper .username',
    engageBar: '.engage-bar-style',
    likeCount: '.like-wrapper .count',
    collectCount: '.collect-wrapper .count',
    chatCount: '.chat-wrapper .count',
    closeCircle: '.close-circle',
  },

  noteDetail: {
    noteContainer: '.note-container',
    mediaContainer: '.media-container',
    detailTitle: '#detail-title',
    titleFallback: '.title',
    noteScroller: '.note-scroller',
    noteText: '.note-content .note-text span',
    noteTags: '.note-content .note-text a',
    authorContainer: '.author-container .info',
    authorAvatar: '.avatar-item',
    authorUsername: '.username',
    interactContainer: '.interact-container',
    commentCount: '.chat-wrapper .count',
    likeCount: '.like-wrapper .count',
    mediaImages: '.media-container img',
    mediaVideos: '.media-container video',
  },

  comments: {
    commentList: '[role="dialog"] [role="list"]',
    commentItem: '[role="dialog"] [role="list"] [role="listitem"]',
    userName: '[data-testid="user-name"]',
    commentContent: '[data-testid="comment-content"]',
    likesCount: '[data-testid="likes-count"]',
    time: 'time',
  },

  publish: {
    publishLink: 'a[href*="creator.xiaohongshu.com/publish"]',
    imageTextTab: [
      'span.title:has-text("上传图文")',
      'div:has-text("上传图文"):not(:has(div))',
    ],
    fileInput: 'input[type="file"]',
    titleInput: 'input[placeholder*="标题"], input[placeholder*="赞"]',
    contentEditor: '.tiptap.ProseMirror, .ql-editor',
    contentEditableFallback: '[contenteditable="true"]',
    textImageButton: 'button:has-text("文字配图")',
    generateImageButton: 'div:has-text("生成图片"):not(:has(div))',
    publishButton: 'button:has-text("发布")',
    tippyRoot: '[data-tippy-root]',
    tagSuggestionContainer: '#creator-editor-topic-container',
    tagSuggestionItem: '#creator-editor-topic-container .item',
    tagSuggestionSelected: '#creator-editor-topic-container .item.is-selected',
  },

  dashboard: {
    accountDiagnosis: 'text=账号诊断',
    period30Days: 'text=近30日',
    interactionTab: 'h6:has-text("互动数据")',
    followerTab: 'h6:has-text("涨粉数据")',
    diagnosisLabels: ['观看数：', '涨粉数：', '主页访客数：', '发布数：', '互动数：'],
    metricLabels: [
      '曝光数', '观看数', '封面点击率', '平均观看时长', '观看总时长', '视频完播率',
      '点赞数', '评论数', '收藏数', '分享数',
      '净涨粉', '新增关注', '取消关注', '主页访客',
    ],
    contentTable: 'table tbody tr',
    sidebarLinkPrefix: 'a[href*="',
  },

  fans: {
    period30Days: 'text=近30天',
    fansLabels: ['总粉丝数', '新增粉丝数', '流失粉丝数'],
    noDataTexts: ['粉丝数过少', '先去涨粉'],
    noActiveFansText: '最近还没有粉丝和你互动',
  },

  noteManage: {
    /** Note card on /new/note-manager. Each card carries noteId in data-impression. */
    noteCard: 'div.note[data-impression]',
    noteTitle: '.info .raw .title',
    editButton: 'span.control.data-edit',
    deleteButton: 'span.control.data-del',
    /** Delete confirmation dialog */
    deleteDialog: 'div.modal-beer-box',
    deleteConfirmButton: 'button.confirm-btn',
    /** Edit page (publish/update) elements — reuses publish selectors */
    titleInput: 'input[placeholder*="标题"], input[placeholder*="赞"]',
    contentEditor: '.tiptap.ProseMirror',
    publishButton: 'button:has-text("发布")',
  },

  notification: {
    page: '.notification-page',
    tabList: '.reds-tabs-list',
    tabItem: '.reds-tab-item.tab-item',
    activeTab: '.reds-tab-item.active',
    contentContainer: '.tabs-content-container',
    itemContainer: '.tabs-content-container > div.container',
    endContainer: '.end-container',
    userInfo: '.user-info',
    userName: '.user-info a',
    userTag: '.user-info .user-tag',
    interactionHint: '.interaction-hint',
    interactionAction: '.interaction-hint > span:first-child',
    interactionTime: '.interaction-hint .interaction-time',
    interactionContent: '.interaction-content',
    quoteInfo: '.quote-info',
    extraImage: '.extra .extra-image',
    loadMore: 'text=查看更多历史消息',
  },

  engagement: {
    /** The engage bar at the bottom of note detail (like/collect/comment/share) */
    engageBar: '.interact-container .buttons.engage-bar-style',
    likeWrapper: '.interact-container .like-wrapper',
    likeActiveClass: 'like-active',
    collectWrapper: '.interact-container .collect-wrapper',
    collectActiveClass: 'collect-active',
    likeCount: '.interact-container .like-wrapper .count',
    collectCount: '.interact-container .collect-wrapper .count',
    /** Follow button in the author section of note detail */
    followBtnContainer: '.note-detail-follow-btn',
    followButton: '.note-detail-follow-btn button.follow-button',
    followButtonText: '.note-detail-follow-btn button.follow-button .reds-button-new-text',
  },

  replyComment: {
    commentItem: '.comment-item',
    commentAuthor: '.author a.name',
    commentText: '.content .note-text',
    replyButton: '.reply.icon-container',
    replyInput: '#content-textarea',
    submitReply: 'button.btn.submit',
    commentScroller: '.note-scroller',
  },
} as const
