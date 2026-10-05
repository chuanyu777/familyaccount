const { createApp, ref, computed } = Vue;

const iconComponents = {
  ArchiveIcon: LucideVueNext.Archive,
  BellIcon: LucideVueNext.Bell,
  Building2Icon: LucideVueNext.Building2,
  CalendarDaysIcon: LucideVueNext.CalendarDays,
  CarIcon: LucideVueNext.Car,
  ChartNoAxesCombinedIcon: LucideVueNext.ChartNoAxesCombined,
  CheckIcon: LucideVueNext.Check,
  ChevronDownIcon: LucideVueNext.ChevronDown,
  ChevronLeftIcon: LucideVueNext.ChevronLeft,
  ChevronRightIcon: LucideVueNext.ChevronRight,
  CircleCheckIcon: LucideVueNext.CircleCheck,
  CircleIcon: LucideVueNext.Circle,
  CopyIcon: LucideVueNext.Copy,
  CreditCardIcon: LucideVueNext.CreditCard,
  CrownIcon: LucideVueNext.Crown,
  EllipsisIcon: LucideVueNext.Ellipsis,
  HandCoinsIcon: LucideVueNext.HandCoins,
  HomeIcon: LucideVueNext.House,
  LandmarkIcon: LucideVueNext.Landmark,
  Link2Icon: LucideVueNext.Link2,
  LockKeyholeIcon: LucideVueNext.LockKeyhole,
  LogOutIcon: LucideVueNext.LogOut,
  MessageCircleIcon: LucideVueNext.MessageCircle,
  NotebookTabsIcon: LucideVueNext.NotebookTabs,
  PlusIcon: LucideVueNext.Plus,
  ReceiptTextIcon: LucideVueNext.ReceiptText,
  ScanLineIcon: LucideVueNext.ScanLine,
  SettingsIcon: LucideVueNext.Settings,
  Share2Icon: LucideVueNext.Share2,
  ShieldCheckIcon: LucideVueNext.ShieldCheck,
  ShoppingBasketIcon: LucideVueNext.ShoppingBasket,
  TagsIcon: LucideVueNext.Tags,
  UtensilsIcon: LucideVueNext.Utensils,
  UserPlusIcon: LucideVueNext.UserPlus,
  UserRoundIcon: LucideVueNext.UserRound,
  WalletCardsIcon: LucideVueNext.WalletCards,
  XIcon: LucideVueNext.X,
};

createApp({
  components: iconComponents,
  setup() {
    const screen = ref('accounting');
    const previousScreen = ref('accounting');
    const overlay = ref(null);
    const toast = ref('');
    const currentLedger = ref('周末小家');
    const draftLedgerName = ref('我们的家');
    const transactionKind = ref('支出');
    const transactionFilter = ref('全部');
    const selectedCategory = ref('餐饮');
    let toastTimer;

    const entryScreens = [
      { key: 'login', label: '微信登录', icon: 'MessageCircleIcon' },
      { key: 'empty', label: '首次使用', icon: 'NotebookTabsIcon' },
      { key: 'invite', label: '接受邀请', icon: 'Link2Icon' },
    ];

    const tabScreens = [
      { key: 'accounting', label: '记账与流水', shortLabel: '记账', icon: 'ReceiptTextIcon' },
      { key: 'assets', label: '账户与资产', shortLabel: '资产', icon: 'WalletCardsIcon' },
      { key: 'liabilities', label: '负债与还款', shortLabel: '负债', icon: 'LandmarkIcon' },
      { key: 'analysis', label: '统计分析', shortLabel: '分析', icon: 'ChartNoAxesCombinedIcon' },
      { key: 'settings', label: '账本设置', shortLabel: '设置', icon: 'SettingsIcon' },
    ];

    const screenMeta = {
      login: ['微信登录', '普通用户只有一个清晰的微信登录入口，不出现 Web 账号选择。'],
      empty: ['我的家庭账本', '首次进入不自动建账，明确提供创建账本和接受邀请。'],
      create: ['创建家庭账本', '只要求一个账本名称，默认账户与常用分类由系统初始化。'],
      invite: ['账本邀请', '展示邀请人、目标账本、成员角色和有效期，接受前需确认。'],
      accounting: ['记账', '突出本月结余、收支数据和最近流水，新增记账始终触手可及。'],
      assets: ['资产', '账户与家庭资产分区呈现，共享资源不显示成员归属。'],
      liabilities: ['负债', '负债进度与还款记录放在同一业务视图中。'],
      analysis: ['分析', '用克制的数据图表呈现月度趋势和支出分类。'],
      settings: ['设置', '成员、邀请和账本管理集中在此，并根据 Owner 权限显示操作。'],
      binding: ['绑定 Web 账号', '仅作为设置中的次级入口，普通用户登录流程不会经过这里。'],
    };

    const ledgers = [
      { name: '周末小家', role: 'Owner', members: 2, color: 'blue' },
      { name: '爸妈生活账', role: 'Member', members: 4, color: 'green' },
      { name: '旅行基金', role: 'Member', members: 3, color: 'gold' },
    ];

    const categories = [
      { label: '餐饮', icon: 'UtensilsIcon' },
      { label: '购物', icon: 'ShoppingBasketIcon' },
      { label: '交通', icon: 'CarIcon' },
      { label: '居家', icon: 'HomeIcon' },
    ];

    const transactionGroups = [
      {
        date: '今天 · 10月5日',
        total: '支出 ¥ 2,938.00',
        items: [
          { title: '装修分期还款', meta: '还款 · 陈越', amount: '-¥ 2,800.00', tone: 'expense', icon: 'HandCoinsIcon', type: '支出' },
          { title: '周末采购', meta: '购物 · 林夏', amount: '-¥ 138.00', tone: 'expense', icon: 'ShoppingBasketIcon', type: '支出' },
        ],
      },
      {
        date: '10月3日',
        total: '收入 ¥ 5,000.00 · 支出 ¥ 86.50',
        items: [
          { title: '项目奖金', meta: '工资 · 陈越', amount: '+¥ 5,000.00', tone: 'income', icon: 'LandmarkIcon', type: '收入' },
          { title: '家庭晚餐', meta: '餐饮 · 陈越', amount: '-¥ 86.50', tone: 'expense', icon: 'UtensilsIcon', type: '支出' },
        ],
      },
    ];

    const chartBars = [
      { month: '5月', income: 62, expense: 41 },
      { month: '6月', income: 74, expense: 48 },
      { month: '7月', income: 68, expense: 57 },
      { month: '8月', income: 85, expense: 52 },
      { month: '9月', income: 76, expense: 61 },
      { month: '10月', income: 91, expense: 58 },
    ];

    const pageTitle = computed(() => screenMeta[screen.value]?.[0] || '家庭账本');
    const currentDescription = computed(() => screenMeta[screen.value]?.[1] || '');
    const showTabbar = computed(() => tabScreens.some((item) => item.key === screen.value));
    const canGoBack = computed(() => ['create', 'invite', 'binding'].includes(screen.value));
    const visibleTransactions = computed(() => {
      if (transactionFilter.value === '全部') return transactionGroups;
      return transactionGroups
        .map((group) => ({ ...group, items: group.items.filter((item) => item.type === transactionFilter.value) }))
        .filter((group) => group.items.length);
    });

    function openScreen(key) {
      if (key !== screen.value) previousScreen.value = screen.value;
      screen.value = key;
      overlay.value = null;
    }

    function goBack() {
      if (screen.value === 'binding') openScreen('settings');
      else if (screen.value === 'invite' || screen.value === 'create') openScreen('empty');
      else openScreen(previousScreen.value || 'accounting');
    }

    function showToast(message) {
      toast.value = message;
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => { toast.value = ''; }, 2200);
    }

    function login() {
      openScreen('empty');
      showToast('登录成功');
    }

    function createLedger() {
      currentLedger.value = draftLedgerName.value.trim() || '我们的家';
      openScreen('accounting');
      showToast('家庭账本已创建');
    }

    function acceptInvite() {
      currentLedger.value = '周末小家';
      openScreen('accounting');
      showToast('已加入周末小家');
    }

    function switchLedger(name) {
      currentLedger.value = name;
      overlay.value = null;
      showToast(`已切换到${name}`);
    }

    function saveTransaction() {
      overlay.value = null;
      showToast('已记一笔');
    }

    return {
      screen,
      overlay,
      toast,
      currentLedger,
      draftLedgerName,
      transactionKind,
      transactionFilter,
      selectedCategory,
      entryScreens,
      tabScreens,
      ledgers,
      categories,
      chartBars,
      pageTitle,
      currentDescription,
      showTabbar,
      canGoBack,
      visibleTransactions,
      openScreen,
      goBack,
      showToast,
      login,
      createLedger,
      acceptInvite,
      switchLedger,
      saveTransaction,
    };
  },
}).mount('#app');
