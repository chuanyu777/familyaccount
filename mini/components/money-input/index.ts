interface ComponentContext { triggerEvent(name: string, detail: Record<string, unknown>): void; }

Component({
  properties: {
    value: { type: String, value: '' },
    label: { type: String, value: '金额' },
    placeholder: { type: String, value: '0.00' },
    disabled: { type: Boolean, value: false },
  },
  methods: {
    handleInput(this: ComponentContext, event: { detail: { value: string } }): void {
      this.triggerEvent('input', { value: event.detail.value });
    },
  },
});
