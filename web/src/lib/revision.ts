import { ref } from 'vue';

/**
 * 全局数据版本号。
 *
 * 任何写操作（新增 / 编辑 / 删除）成功后 +1，各页面 watch 它并强制走网络重新拉取，
 * 这样「记完一笔列表没变」「删了资产合计没动」这类问题不会再依赖缓存失效时机。
 */
export const revision = ref(0);

export function bumpRevision(): void {
  revision.value += 1;
}
