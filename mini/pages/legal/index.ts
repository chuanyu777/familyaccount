interface Section {
  heading: string;
  paragraphs: string[];
}

interface LegalDoc {
  key: 'terms' | 'privacy';
  title: string;
  updated: string;
  intro: string;
  sections: Section[];
}

const UPDATED = '2026 年 11 月 11 日';
const CONTACT_EMAIL = '331719898@qq.com';

const DOCS: Record<'terms' | 'privacy', LegalDoc> = {
  terms: {
    key: 'terms',
    title: '服务条款',
    updated: UPDATED,
    intro:
      '欢迎使用「一起记账」。本条款是你与本小程序之间的协议，请你仔细阅读。你使用微信登录即表示已阅读并同意本条款。',
    sections: [
      {
        heading: '一、服务内容',
        paragraphs: [
          '本小程序为家庭提供记账工具，包括收支记录、分类统计、资产与负债管理、账本成员协作及可选的智能助手查询功能。',
          '本服务不构成投资、理财、税务或法律建议，不对任何具体金融产品作出推荐或评价。',
        ],
      },
      {
        heading: '二、账号与使用',
        paragraphs: [
          '你通过微信授权登录使用本服务。同一账本可邀请家庭成员共同使用，账本管理员可管理成员与数据权限。',
          '你应妥善保管自己的微信账号，并对账号下发生的所有操作负责。请勿将账号交由他人使用。',
          '你不得利用本服务从事任何违法违规活动，不得上传违法、侵权或虚假信息。',
        ],
      },
      {
        heading: '三、数据归属',
        paragraphs: [
          '你录入的账本数据归你所有。我们仅为向你提供服务而存储和展示这些数据，不会将其用于与本服务无关的用途。',
          '你可以在小程序内随时查看、修改、导出或删除自己的数据；删除账本后相关数据将按隐私政策约定的方式处理。',
        ],
      },
      {
        heading: '四、服务变更与终止',
        paragraphs: [
          '我们可能根据业务发展调整功能或本条款内容。重要变更将在小程序内提示，继续使用即视为接受变更后的条款。',
          '如你违反本条款，我们有权暂停或终止向你提供服务。',
        ],
      },
      {
        heading: '五、免责声明',
        paragraphs: [
          '本服务按「现状」提供。因网络故障、设备故障、不可抗力或第三方服务（如微信登录）异常导致的服务中断，我们不承担由此产生的损失。',
          '记账数据的准确性依赖你的录入，请在重要决策前自行核对，并建议定期备份重要数据。',
        ],
      },
      {
        heading: '六、法律适用',
        paragraphs: ['本条款适用中华人民共和国法律。如双方就本条款发生争议，应友好协商解决。'],
      },
      {
        heading: '七、联系我们',
        paragraphs: [`如对本条款有疑问，或需要咨询账号与数据相关问题，可发送邮件至 ${CONTACT_EMAIL} 与我们联系。`],
      },
    ],
  },
  privacy: {
    key: 'privacy',
    title: '隐私政策',
    updated: UPDATED,
    intro:
      '我们重视你的隐私。本政策说明「一起记账」在提供家庭记账服务时收集哪些信息、如何使用与保护这些信息，以及你享有的权利。',
    sections: [
      {
        heading: '一、我们收集的信息',
        paragraphs: [
          '登录标识：你使用微信登录时，我们获取微信提供的用户唯一标识（openid），用于识别账号、关联你在各设备上的数据。',
          '你主动提供的信息：微信昵称与头像（如你授权）、手机号（如你选择绑定）、账本名称、成员邀请关系。',
          '记账数据：你录入的收支记录、金额、日期、分类、备注、账户余额、资产与负债条目、估值记录。',
          '设备与日志信息：为保障服务稳定与排查故障，我们会记录必要的访问日志（如请求时间、接口错误），不采集通讯录、位置、相册等与记账无关的信息。',
        ],
      },
      {
        heading: '二、信息的使用',
        paragraphs: [
          '上述信息仅用于：向你提供记账、统计与资产负债分析服务；实现账本成员间的数据共享与协作；保障账号与数据安全；响应你的咨询与权利请求。',
          '我们不会将你的信息用于广告推送，也不会出售你的个人信息。',
        ],
      },
      {
        heading: '三、信息的存储与保护',
        paragraphs: [
          '你的数据存储于我们自有的服务器（位于中华人民共和国境内），传输过程使用 HTTPS 加密。',
          '我们采取访问控制、备份等措施保护数据安全。但请注意，任何互联网传输与存储都无法保证绝对安全。',
          '数据保存期限：在你的账号存续期间持续保存；你删除账本或注销账号后，相关数据将在合理期限内删除或匿名化处理，法律法规另有规定的除外。',
        ],
      },
      {
        heading: '四、信息的共享',
        paragraphs: [
          '同一账本内的成员可查看该账本的数据，这是家庭协作记账的必要功能。',
          '除以下情形外，我们不会向第三方共享你的信息：获得你的明确同意；法律法规要求或司法机关依法要求；为保护你或他人的重大合法权益所必需。',
          '本服务使用微信登录能力，微信对登录过程的信息处理适用微信自身的隐私政策。',
        ],
      },
      {
        heading: '五、你的权利',
        paragraphs: [
          '你可以随时在小程序内查看、更正、导出或删除自己的记账数据。',
          '你可以退出账本、删除账本数据，或申请注销账号，我们将按约定处理你的个人信息。',
          `如你希望行使上述权利或对我们的处理方式有疑问，可发送邮件至 ${CONTACT_EMAIL} 联系我们。`,
        ],
      },
      {
        heading: '六、未成年人保护',
        paragraphs: [
          '本服务面向家庭用户，不面向 14 周岁以下的儿童单独提供服务。若你是未成年人，请在监护人指导下使用。',
        ],
      },
      {
        heading: '七、联系我们',
        paragraphs: [
          `如对本政策有任何疑问、意见或投诉，或希望行使上述权利，可发送邮件至 ${CONTACT_EMAIL}，我们会在合理期限内回复。`,
        ],
      },
      {
        heading: '八、政策更新',
        paragraphs: [
          `本政策更新于 ${UPDATED}。如有重大变更，我们将在小程序内提示；继续使用即表示你接受更新后的政策。`,
        ],
      },
    ],
  },
};

interface PageData {
  doc: LegalDoc;
}

interface PageContext {
  data: PageData;
  setData(data: Partial<PageData>): void;
}

Page({
  data: { doc: DOCS.terms },

  onLoad(query: Record<string, string | undefined>): void {
    const page = this as unknown as PageContext;
    const key = query.type === 'privacy' ? 'privacy' : 'terms';
    const doc = DOCS[key];
    page.setData({ doc });
    wx.setNavigationBarTitle({ title: doc.title });
  },
});
