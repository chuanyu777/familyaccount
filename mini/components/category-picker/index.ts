export {};

interface CategoryComponentContext {
  data: { categories: Array<{ id: number; name: string }> };
  setData(data: { selectedIndex: number; selectedLabel: string }): void;
  triggerEvent(name: string, detail: Record<string, unknown>): void;
}
Component({
  properties: { categories: { type: Array, value: [] }, value: { type: Number, value: 0 }, label: { type: String, value: '分类' } },
  data: { selectedIndex: 0, selectedLabel: '请选择分类' },
  observers: {
    'categories, value'(this: CategoryComponentContext, categories: Array<{ id: number; name: string }>, value: number): void {
      const index = categories.findIndex(({ id }) => id === value);
      this.setData({ selectedIndex: Math.max(index, 0), selectedLabel: categories[index]?.name ?? '请选择分类' });
    },
  },
  methods: {
    handleTap(this: CategoryComponentContext, event: { currentTarget: { dataset: { index: number } } }): void {
      const index = Number(event.currentTarget.dataset.index);
      const category = this.data.categories[index];
      if (category) {
        this.setData({ selectedIndex: index, selectedLabel: category.name });
        this.triggerEvent('change', { id: category.id });
      }
    },
    handleChange(this: CategoryComponentContext, event: { detail: { value: string } }): void {
      const index = Number(event.detail.value);
      const category = this.data.categories[index];
      if (category) {
        this.setData({ selectedIndex: index, selectedLabel: category.name });
        this.triggerEvent('change', { id: category.id });
      }
    },
  },
});
