import { currentLedgerStore } from '../../lib/currentLedger';
import { calibrateAccount, createAccount, listAccounts, updateAccount, type Account } from '../../services/accounts';
import { activeEntries, booleanLike, currentMonth, parseYuanToCents } from '../../services/business-state';
import { archiveSharedResource, createAsset, createSnapshot, listAssets, listSnapshots, restoreSharedResource, updateAsset, type Asset, type AssetSnapshot } from '../../services/assets';
interface Data { ledgerName: string; switcherOpen: boolean; accounts: Account[]; assets: Asset[]; totalNet: string; totalAccounts: string; totalAssets: string; snapshots: AssetSnapshot[]; snapshotsLoading: boolean; snapshotsError: string; selectedAssetId: number | null; form: 'account' | 'asset' | 'snapshot' | 'calibrate' | ''; editingId: number | null; name: string; value: string; kind: string; month: string; note: string; isOwner: boolean; loading: boolean; saving: boolean; errorMessage: string; }
interface PageContext { data: Data; snapshotLoadId: number; showSnapshots(event: { currentTarget: { dataset: { id: string | number } } }): Promise<void>; setData(data: Partial<Data>): void; onShow(): Promise<void>; }
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const isOwner = () => currentLedgerStore.get()?.role === 'OWNER';
Page({
  snapshotLoadId: 0,
  data: { ledgerName: '我的账本', switcherOpen: false, accounts: [], assets: [], totalNet: '0.00', totalAccounts: '0.00', totalAssets: '0.00', snapshots: [], snapshotsLoading: false, snapshotsError: '', selectedAssetId: null, form: '', editingId: null, name: '', value: '', kind: '', month: currentMonth(), note: '', isOwner: false, loading: false, saving: false, errorMessage: '' },
  async onShow(): Promise<void> { const page = this as unknown as PageContext; page.setData({ loading: true, errorMessage: '', isOwner: isOwner(), ledgerName: currentLedgerStore.get()?.name ?? '我的账本' }); const [accounts, assets] = await Promise.allSettled([listAccounts(), listAssets()]); const accountItems = accounts.status === 'fulfilled' ? accounts.value : []; const assetItems = assets.status === 'fulfilled' ? assets.value : []; const accountCents = accountItems.filter((item) => !booleanLike(item.archived)).reduce((sum, item) => sum + (item.balanceCents ?? Number(item.balance ?? 0) * 100), 0); const assetCents = assetItems.filter((item) => !booleanLike(item.archived)).reduce((sum, item) => sum + (item.valueCents ?? Number(item.value ?? 0) * 100), 0); page.setData({ accounts: accountItems, assets: assetItems, totalAccounts: (accountCents / 100).toFixed(2), totalAssets: (assetCents / 100).toFixed(2), totalNet: ((accountCents + assetCents) / 100).toFixed(2), errorMessage: accounts.status === 'rejected' || assets.status === 'rejected' ? '资产或账户加载失败' : '', loading: false }); },
  openLedgerSwitcher(): void { (this as unknown as PageContext).setData({ switcherOpen: true }); },
  closeLedgerSwitcher(): void { (this as unknown as PageContext).setData({ switcherOpen: false }); },
  openAccount(): void { (this as unknown as PageContext).setData({ form: 'account', editingId: null, name: '', value: '', kind: '', errorMessage: '' }); },
  openCalibration(event: { currentTarget: { dataset: { id: string | number } } }): void {
    const page = this as unknown as PageContext;
    const item = page.data.accounts.find(({ id }) => id === Number(event.currentTarget.dataset.id));
    if (item && !booleanLike(item.archived)) {
      page.setData({ form: 'calibrate', editingId: item.id, name: item.name, value: item.balanceCents !== undefined ? (item.balanceCents / 100).toFixed(2) : item.balance ?? '0.00', errorMessage: '' });
    }
  },
  openAccountEdit(event: { currentTarget: { dataset: { id: string } } }): void { const page = this as unknown as PageContext; const item = page.data.accounts.find(({ id }) => id === Number(event.currentTarget.dataset.id)); page.setData({ form: 'account', editingId: item?.id ?? null, name: item?.name ?? '' }); },
  openAsset(): void { (this as unknown as PageContext).setData({ form: 'asset', editingId: null, name: '', value: '', kind: '', errorMessage: '' }); },
  openAssetEdit(event: { currentTarget: { dataset: { id: string } } }): void { const page = this as unknown as PageContext; const item = page.data.assets.find(({ id }) => id === Number(event.currentTarget.dataset.id)); if (item) page.setData({ form: 'asset', editingId: item.id, name: item.name, value: String((item.valueCents ?? 0) / 100), kind: item.kind ?? '' }); },
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
