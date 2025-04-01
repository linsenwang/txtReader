export function getMiddlePIndex() {
    const paragraphs = document.querySelectorAll("p");
    if (paragraphs.length === 0) return null;

    const viewportMiddle = window.innerHeight / 2 + window.scrollY; // 计算可视区域中心位置
    let closestP = null;
    let closestDistance = Infinity;

    paragraphs.forEach((p) => {
        const rect = p.getBoundingClientRect();
        const pMiddle = rect.top + window.scrollY + rect.height / 2; // 计算 <p> 的中心点

        const distance = Math.abs(viewportMiddle - pMiddle);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestP = p;
        }
    });

    return closestP ? closestP.id || null : null; // 返回 id，如果没有 id，则返回 null
}

