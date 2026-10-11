import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { apiGet, apiPatch, apiPost } from '../../lib/api';
import { publishResources } from '../../lib/resourceInvalidation';
import AssistantPanel from './AssistantPanel.vue';

vi.mock('../../lib/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
}));

vi.mock('../../lib/resourceInvalidation', () => ({
  publishResources: vi.fn(),
}));

const mockedApiGet = vi.mocked(apiGet) as unknown as Mock;
const mockedApiPost = vi.mocked(apiPost) as unknown as Mock;
const mockedApiPatch = vi.mocked(apiPatch) as unknown as Mock;

const DRAFT_MESSAGE = {
  id: 2,
  role: 'assistant' as const,
  content: '草稿已生成，请在卡片上确认。',
  blocks: [{
    type: 'transaction_draft',
    actionId: 7,
    version: 0,
    fields: {
      type: 'expense',
      amount: '36.00',
      occurredOn: '2026-10-10',
      accountId: 1,
      accountName: '默认账户',
      categoryName: '交通',
      note: '打车',
    },
    inferredFields: ['category_name'],
  }],
};

const METRIC_MESSAGE = {
  id: 3,
  role: 'assistant' as const,
  content: '这是本月收支汇总。',
  blocks: [{ type: 'metric', data: { month: '2026-10', income: '0.00', expense: '36.00', net: '-36.00' } }],
};

async function mountPanel(messages: unknown[]): Promise<ReturnType<typeof mount>> {
  // 模拟「同一标签页内已有一个会话」：组件会沿用该会话并拉取历史消息，
  // 否则它会开新会话并把消息列表清空（这是真实行为）。
  sessionStorage.setItem('family-ledger.assistant-conversation', '9');
  mockedApiPost.mockImplementation((path: string) => Promise.resolve(
    path === '/assistant/conversations' ? { id: 9 } : {},
  ));
  mockedApiGet.mockResolvedValue(messages);
  const wrapper = mount(AssistantPanel, { props: { open: true } });
  await flushPromises();
  return wrapper;
}

describe('助手确认卡', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockedApiGet.mockReset();
    mockedApiPost.mockReset();
    mockedApiPatch.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('渲染草稿卡：字段、AI 补充标记与三个操作都在', async () => {
    const wrapper = await mountPanel([DRAFT_MESSAGE]);
    const card = wrapper.find('.assistant-draft-card');
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain('¥36.00');
    expect(card.text()).toContain('默认账户');
    expect(card.text()).toContain('交通');
    expect(card.text()).toContain('打车');
    expect(card.text()).toContain('AI 补充');
    expect(card.findAll('button').map((button) => button.text())).toEqual(['确认记账', '修改', '取消']);
  });

  it('确认记账：调用确认接口、刷新账目账户统计，并显示已记入账本', async () => {
    const wrapper = await mountPanel([DRAFT_MESSAGE]);
    await wrapper.find('.assistant-draft-card button').trigger('click');
    await flushPromises();
    expect(mockedApiPost).toHaveBeenCalledWith('/assistant/actions/7/confirm', {});
    expect(publishResources).toHaveBeenCalledWith(['transactions', 'accounts', 'statistics']);
    expect(wrapper.find('.assistant-draft-card').text()).toContain('已记入账本');
  });

  it('取消：调用取消接口，并明确告知没有修改账本', async () => {
    const wrapper = await mountPanel([DRAFT_MESSAGE]);
    const buttons = wrapper.findAll('.assistant-draft-card button');
    await buttons[buttons.length - 1]!.trigger('click');
    await flushPromises();
    expect(mockedApiPost).toHaveBeenCalledWith('/assistant/actions/7/cancel', {});
    expect(wrapper.find('.assistant-draft-card').text()).toContain('没有对账本做任何修改');
  });

  it('修改：卡上可编辑，保存时带上新值并展示后端返回的最新预览', async () => {
    const wrapper = await mountPanel([DRAFT_MESSAGE]);
    const buttons = () => wrapper.findAll('.assistant-draft-card button');
    await buttons()[1]!.trigger('click');           // 修改
    await flushPromises();
    const inputs = wrapper.findAll('.assistant-draft-card input');
    expect(inputs.length).toBe(4);                   // 金额 / 日期 / 分类 / 备注
    await inputs[0]!.setValue('40.00');
    mockedApiPatch.mockResolvedValue({ version: 1, payload: { ...DRAFT_MESSAGE.blocks[0]!.fields, amount: '40.00' } });

    await buttons()[0]!.trigger('click');            // 保存修改
    await flushPromises();
    expect(mockedApiPatch).toHaveBeenCalledTimes(1);
    expect(mockedApiPatch.mock.calls[0]![0]).toBe('/assistant/actions/7');
    expect(mockedApiPatch.mock.calls[0]![1]).toMatchObject({ amount: '40.00' });
    const card = wrapper.find('.assistant-draft-card');
    expect(card.text()).toContain('¥40.00');
    expect(card.findAll('button').map((button) => button.text())).toEqual(['确认记账', '修改', '取消']);
  });

  it('确认失败时给出错误提示，卡片保持可操作', async () => {
    const wrapper = await mountPanel([DRAFT_MESSAGE]);
    mockedApiPost.mockRejectedValue(new Error('网络异常'));
    await wrapper.find('.assistant-draft-card button').trigger('click');
    await flushPromises();
    const card = wrapper.find('.assistant-draft-card');
    expect(card.text()).toContain('网络异常');
    expect(card.text()).not.toContain('已记入账本');
    expect(card.findAll('button')).toHaveLength(3);
  });

  it('普通指标卡片不受确认卡影响（回归）', async () => {
    const wrapper = await mountPanel([METRIC_MESSAGE]);
    expect(wrapper.find('.assistant-draft-card').exists()).toBe(false);
    const insight = wrapper.find('.assistant-insight-card');
    expect(insight.exists()).toBe(true);
    expect(insight.text()).toContain('-36.00');
  });
});
