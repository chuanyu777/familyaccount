import { currentLedgerStore } from '../../lib/currentLedger';
import { listLedgers, switchLedger } from '../../services/ledgers';

interface ComponentContext { data: { ledgers: Array<{ id: number; name: string; role: string }>; currentId: number | null }; setData(data: Record<string, unknown>): void; triggerEvent(name: string): void; refresh(): Promise<void>; }

Component({
  properties: { visible: { type: Boolean, value: false } }, data: { ledgers: [], currentId: null as number | null },
  observers: { visible(this: ComponentContext, visible: boolean): void { if (visible) void this.refresh(); } },
  lifetimes: { attached(this: ComponentContext): void { this.setData({ currentId: currentLedgerStore.get()?.id ?? null }); } },
  methods: {
    async refresh(this: ComponentContext): Promise<void> { this.setData({ ledgers: await listLedgers(), currentId: currentLedgerStore.get()?.id ?? null }); },
    close(this: ComponentContext): void { this.triggerEvent('close'); },
    noop(): void {},
    createLedger(this: ComponentContext): void { this.triggerEvent('close'); wx.navigateTo({ url: '/pages/ledger/create' }); },
    handleChange(this: ComponentContext, event: { currentTarget: { dataset: { ledger: { id: number; name: string; role: string } } } }): void { this.triggerEvent('close'); switchLedger(event.currentTarget.dataset.ledger); },
  },
});
