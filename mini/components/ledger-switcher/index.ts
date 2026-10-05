import { currentLedgerStore } from '../../lib/currentLedger';
import { listLedgers, switchLedger } from '../../services/ledgers';

interface ComponentContext { setData(data: Record<string, unknown>): void; }

Component({
  properties: { ledgers: { type: Array, value: [] } }, data: { currentId: null as number | null },
  lifetimes: { attached(this: ComponentContext): void { this.setData({ currentId: currentLedgerStore.get()?.id ?? null }); } },
  methods: {
    async refresh(this: ComponentContext): Promise<void> { this.setData({ ledgers: await listLedgers() }); },
    handleChange(this: ComponentContext, event: { currentTarget: { dataset: { ledger: { id: number; name: string; role: string } } } }): void { switchLedger(event.currentTarget.dataset.ledger); },
  },
});
