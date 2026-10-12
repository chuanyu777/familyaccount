import { currentLedgerStore } from '../../lib/currentLedger';
import { calibrateAccount, createAccount, listAccounts, updateAccount, type Account } from '../../services/accounts';
import { activeEntries, booleanLike, currentMonth, parseYuanToCents } from '../../services/business-state';
import { archiveSharedResource, createAsset, createSnapshot, listAssets, listSnapshots, restoreSharedResource, updateAsset, type Asset, type AssetSnapshot } from '../../services/assets';
interface Data { ledgerName: string; switcherOpen: boolean; accounts: Account[]; assets: Asset[]; totalNet: string; totalAccounts: string; totalAssets: string; snapshots: AssetSnapshot[]; snapshotsLoading: boolean; snapshotsError: string; selectedAssetId: number | null; form: 'account' | 'asset' | 'snapshot' | 'calibrate' | ''; editingId: number | null; name: string; value: string; kind: string; kindOptions: string[]; kindIndex: number; month: string; note: string; isOwner: boolean; loading: boolean; saving: boolean; errorMessage: string; }
interface PageContext { data: Data; snapshotLoadId: number; showSnapshots(event: { currentTarget: { dataset: { id: string | number } } }): Promise<void>; setData(data: Partial<Data>): void; onShow(): Promise<void>; }
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const isOwner = () => currentLedgerStore.get()?.role === 'OWNER';
/** 资金账户固定银行卡 emoji（替换原 CSS 画的卡片图形，与全站 emoji 图标风格统一）。 */
const ACCOUNT_EMOJI = '💳';
/** 资产类型 → emoji：按 kind 文本子串匹配，未命中给 💼。 */
/** 资产类型可选值（空项 = 不选；与 Web 下拉保持一致） */
const ASSET_KIND_OPTIONS = ['不选', '不动产', '金融投资', '车辆', '黄金珠宝', '存款现金', '保险', '收藏品', '其他'];

/** 类型关键词 → emoji（含存量自由文本写法，如「投资」；顺序即优先级） */
const KIND_KEYWORDS: Array<[string, string]> = [
  ['不动产', '🏠'], ['房产', '🏠'], ['房', '🏠'],
  ['金融投资', '📈'], ['投资', '📈'], ['基金', '📈'], ['股票', '📈'], ['理财', '📈'], ['证券', '📈'],
  ['车辆', '🚗'], ['车', '🚗'],
  ['黄金珠宝', '🪙'], ['黄金', '🪙'], ['贵金属', '🪙'], ['珠宝', '🪙'],
  ['存款现金', '💰'], ['存款', '💰'], ['现金', '💰'],
  ['保险', '🛡️'],
  ['收藏品', '🏺'], ['收藏', '🏺'], ['古玩', '🏺'],
];

/** 名称关键词 → emoji：类型没填时按名称兜底（房 → 车 → 贵金属 → 保险 → 收藏 → 存款 → 投资） */
const NAME_KEYWORDS: Array<[string, string]> = [
  ['房', '🏠'], ['住宅', '🏠'], ['公寓', '🏠'], ['别墅', '🏠'], ['商铺', '🏠'], ['写字楼', '🏠'],
  ['车', '🚗'], ['特斯拉', '🚗'], ['宝马', '🚗'], ['奔驰', '🚗'], ['奥迪', '🚗'], ['保时捷', '🚗'],
  ['比亚迪', '🚗'], ['蔚来', '🚗'], ['理想', '🚗'], ['小鹏', '🚗'], ['丰田', '🚗'], ['本田', '🚗'],
  ['黄金', '🪙'], ['金条', '🪙'], ['金饰', '🪙'], ['贵金属', '🪙'], ['珠宝', '🪙'], ['钻石', '🪙'],
  ['保险', '🛡️'], ['保单', '🛡️'],
  ['收藏', '🏺'], ['古玩', '🏺'], ['字画', '🏺'], ['邮票', '🏺'], ['纪念币', '🏺'],
  ['存款', '💰'], ['现金', '💰'], ['活期', '💰'], ['定期', '💰'],
  ['股票', '📈'], ['基金', '📈'], ['理财', '📈'], ['证券', '📈'], ['债券', '📈'], ['投资', '📈'],
  ['茅台', '📈'], ['五粮液', '📈'], ['宁德时代', '📈'], ['腾讯', '📈'], ['阿里', '📈'], ['苹果', '📈'], ['英伟达', '📈'],
];

function matchKeyword(text: string, table: Array<[string, string]>): string | null {
  for (const pair of table) {
    if (text.indexOf(pair[0]) >= 0) return pair[1];
  }
  return null;
}

/** 资产图标：用户选的类型优先，类型缺失时按名称兜底，最后 💼（与 Web 逻辑一致）。 */
function assetEmoji(name: string | null | undefined, kind: string | null | undefined): string {
  const kindText = (kind ?? '').trim().toLowerCase();
  if (kindText) {
    const byKind = matchKeyword(kindText, KIND_KEYWORDS);
    if (byKind) return byKind;
  }
  const nameText = (name ?? '').trim().toLowerCase();
  return (nameText ? matchKeyword(nameText, NAME_KEYWORDS) : null) ?? '💼';
}

/** 表单下拉：标准选项 + 存量历史值（不清理数据，编辑时原样保留为一项）。 */
function kindOptionsFor(current: string): string[] {
  const value = current.trim();
  if (value && ASSET_KIND_OPTIONS.indexOf(value) < 0) return [...ASSET_KIND_OPTIONS, value + '（原值）'];
  return [...ASSET_KIND_OPTIONS];
}

function kindIndexOf(options: string[], current: string): number {
  const value = current.trim();
  if (!value) return 0;
  const index = options.indexOf(value);
  return index >= 0 ? index : options.length - 1;
}

Page({
  snapshotLoadId: 0,
  data: { ledgerName: '我的账本', switcherOpen: false, accounts: [], assets: [], totalNet: '0.00', totalAccounts: '0.00', totalAssets: '0.00', snapshots: [], snapshotsLoading: false, snapshotsError: '', selectedAssetId: null, form: '', editingId: null, name: '', value: '', kind: '', kindOptions: [...ASSET_KIND_OPTIONS], kindIndex: 0, month: currentMonth(), note: '', isOwner: false, loading: false, saving: false, errorMessage: '' },
  async onShow(): Promise<void> { const page = this as unknown as PageContext; page.setData({ loading: true, errorMessage: '', isOwner: isOwner(), ledgerName: currentLedgerStore.get()?.name ?? '我的账本' }); const [accounts, assets] = await Promise.allSettled([listAccounts(), listAssets()]); const accountItems = accounts.status === 'fulfilled' ? accounts.value : []; const assetItems = assets.status === 'fulfilled' ? assets.value : []; const accountCents = accountItems.filter((item) => !booleanLike(item.archived)).reduce((sum, item) => sum + (item.balanceCents ?? Number(item.balance ?? 0) * 100), 0); const assetCents = assetItems.filter((item) => !booleanLike(item.archived)).reduce((sum, item) => sum + (item.valueCents ?? Number(item.value ?? 0) * 100), 0); page.setData({ accounts: accountItems.map((item) => ({ ...item, emoji: ACCOUNT_EMOJI })), assets: assetItems.map((item) => ({ ...item, emoji: assetEmoji(item.name, item.kind) })), totalAccounts: (accountCents / 100).toFixed(2), totalAssets: (assetCents / 100).toFixed(2), totalNet: ((accountCents + assetCents) / 100).toFixed(2), errorMessage: accounts.status === 'rejected' || assets.status === 'rejected' ? '资产或账户加载失败' : '', loading: false }); },
  openLedgerSwitcher(): void { (this as unknown as PageContext).setData({ switcherOpen: true }); },
  closeLedgerSwitcher(): void { (this as unknown as PageContext).setData({ switcherOpen: false }); },
  openAssistant(): void { wx.navigateTo({ url: '/pages/assistant/index' }); },
  openAccount(): void { (this as unknown as PageContext).setData({ form: 'account', editingId: null, name: '', value: '', kind: '', errorMessage: '' }); },
  openCalibration(event: { currentTarget: { dataset: { id: string | number } } }): void {
    const page = this as unknown as PageContext;
    const item = page.data.accounts.find(({ id }) => id === Number(event.currentTarget.dataset.id));
    if (item && !booleanLike(item.archived)) {
      page.setData({ form: 'calibrate', editingId: item.id, name: item.name, value: item.balanceCents !== undefined ? (item.balanceCents / 100).toFixed(2) : item.balance ?? '0.00', errorMessage: '' });
    }
  },
  openAccountEdit(event: { currentTarget: { dataset: { id: string } } }): void { const page = this as unknown as PageContext; const item = page.data.accounts.find(({ id }) => id === Number(event.currentTarget.dataset.id)); page.setData({ form: 'account', editingId: item?.id ?? null, name: item?.name ?? '' }); },
  openAsset(): void { (this as unknown as PageContext).setData({ form: 'asset', editingId: null, name: '', value: '', kind: '', kindOptions: [...ASSET_KIND_OPTIONS], kindIndex: 0, errorMessage: '' }); },
  openAssetEdit(event: { currentTarget: { dataset: { id: string } } }): void { const page = this as unknown as PageContext; const item = page.data.assets.find(({ id }) => id === Number(event.currentTarget.dataset.id)); if (item) { const options = kindOptionsFor(item.kind ?? ''); page.setData({ form: 'asset', editingId: item.id, name: item.name, value: String((item.valueCents ?? 0) / 100), kind: item.kind ?? '', kindOptions: options, kindIndex: kindIndexOf(options, item.kind ?? '') }); } },
  /** 类型下拉选择：写回实际值（去掉「（原值）」后缀；「不选」存空）。 */
  handleKindChange(event: { detail: { value: string | number } }): void {
    const page = this as unknown as PageContext;
    const index = Number(event.detail.value);
    const label = page.data.kindOptions[index] ?? '';
    const value = label === '不选' ? '' : (label.endsWith('（原值）') ? label.slice(0, -4) : label);
    page.setData({ kindIndex: index, kind: value });
  },
  async openSnapshot(event: { currentTarget: { dataset: { id: string } } }): Promise<void> { const page = this as unknown as PageContext; const item = page.data.assets.find(({ id }) => id === Number(event.currentTarget.dataset.id)); if (item && !item.archived) { page.setData({ form: 'snapshot', editingId: item.id, selectedAssetId: item.id, value: String((item.valueCents ?? 0) / 100), month: currentMonth(), note: '' }); await page.showSnapshots(event); } },
  closeForm(): void { const page = this as unknown as PageContext; if (!page.data.saving) page.setData({ form: '', editingId: null }); },
  handleInput(event: { currentTarget: { dataset: { field: keyof Data } }; detail: { value: string } }): void { const page = this as unknown as PageContext; page.setData({ [event.currentTarget.dataset.field]: event.detail.value } as Partial<Data>); },
  async saveForm(): Promise<void> { const page = this as unknown as PageContext; if (page.data.saving) return; page.setData({ saving: true, errorMessage: '' }); try { if (page.data.form === 'calibrate' && page.data.editingId !== null) { await calibrateAccount(page.data.editingId, page.data.value); } else if (page.data.form === 'account') { if (!page.data.name.trim()) throw new Error('请输入账户名称'); if (page.data.editingId === null) await createAccount(page.data.name); else await updateAccount(page.data.editingId, page.data.name); } else if (page.data.form === 'asset') { if (!page.data.name.trim() || parseYuanToCents(page.data.value) === null) throw new Error('请填写资产名称和有效市值'); if (page.data.editingId === null) await createAsset({ name: page.data.name, value: page.data.value, kind: page.data.kind }); else await updateAsset(page.data.editingId, { name: page.data.name, value: page.data.value, kind: page.data.kind }); } else if (page.data.form === 'snapshot' && page.data.editingId !== null) await createSnapshot(page.data.editingId, { month: page.data.month, value: page.data.value, note: page.data.note.trim() || null }); page.setData({ form: '' }); await page.onShow(); } catch (error) { page.setData({ errorMessage: errorText(error, '保存失败，请重试') }); } finally { page.setData({ saving: false }); } },
  async toggleArchive(event: { currentTarget: { dataset: { id: string; archived: unknown } } }): Promise<void> { const page = this as unknown as PageContext; if (!isOwner()) return; const id = Number(event.currentTarget.dataset.id); const archived = booleanLike(event.currentTarget.dataset.archived); try { if (archived) await restoreSharedResource('assets', id); else await archiveSharedResource('assets', id); await page.onShow(); } catch (error) { page.setData({ errorMessage: errorText(error, '状态更新失败') }); } },
  async toggleAccountArchive(event: { currentTarget: { dataset: { id: string; archived: unknown } } }): Promise<void> { const page = this as unknown as PageContext; if (!isOwner()) return; const id = Number(event.currentTarget.dataset.id); const archived = booleanLike(event.currentTarget.dataset.archived); try { if (archived) await restoreSharedResource('accounts', id); else await archiveSharedResource('accounts', id); await page.onShow(); } catch (error) { page.setData({ errorMessage: errorText(error, '状态更新失败') }); } },
  async showSnapshots(event: { currentTarget: { dataset: { id: string | number } } }): Promise<void> {
    const page = this as unknown as PageContext;
    const id = Number(event.currentTarget.dataset.id);
    const loadId = ++page.snapshotLoadId;
    page.setData({ selectedAssetId: id, snapshots: [], snapshotsLoading: true, snapshotsError: '' });
    try {
      const snapshots = await listSnapshots(id);
      if (loadId === page.snapshotLoadId) page.setData({ snapshots });
    } catch (error) {
      if (loadId === page.snapshotLoadId) page.setData({ snapshotsError: errorText(error, '市值记录加载失败') });
    } finally {
      if (loadId === page.snapshotLoadId) page.setData({ snapshotsLoading: false });
    }
  },
  retrySnapshots(): void {
    const page = this as unknown as PageContext;
    if (page.data.selectedAssetId !== null) void page.showSnapshots({ currentTarget: { dataset: { id: page.data.selectedAssetId } } });
  },
});
