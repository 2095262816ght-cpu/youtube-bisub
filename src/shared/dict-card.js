// 查词卡片模型：词典响应 → 稳定卡片结构的唯一定义处
// background 归一后传给内容脚本，overlay 只做渲染（展示条数等决策在渲染侧）
const DictCard = (() => {
  function fromYoudao(data) {
    const simple = data.simple?.word?.[0] || {};
    const ec = data.ec?.word?.[0] || {};
    const defs = [];
    for (const trs of ec.trs || []) {
      for (const tr of trs.tr || []) {
        const items = tr.l?.i;
        if (Array.isArray(items)) defs.push(...items.map(String));
        else if (items != null) defs.push(String(items));
      }
    }
    return {
      usphone: simple.usphone || ec.usphone || '',
      ukphone: simple.ukphone || ec.ukphone || '',
      defs,
    };
  }

  function isEmpty(card) {
    return !card || (!card.usphone && !card.ukphone && !card.defs.length);
  }

  return { fromYoudao, isEmpty };
})();
