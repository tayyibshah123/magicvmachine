const TooltipMgr = {
    el: null,
    init() { this.el = document.getElementById('tooltip'); },
    show(text, clientX, clientY) {
        if(!this.el) return;
        this.el.innerHTML = text;
        this.el.classList.remove('hidden');
        
        // Get Game Container bounds
        const container = document.getElementById('game-container');
        const cRect = container.getBoundingClientRect();
        
        // Calculate position relative to the container
        // clientX/Y are global mouse coordinates. 
        // We want the tooltip 'left'/'top' to be relative to the container's top-left.
        let left = clientX - cRect.left;
        let top = clientY - cRect.top;
        
        const tRect = this.el.getBoundingClientRect();
        
        // Offset to center above cursor
        top = top - tRect.height - 20;
        left = left - (tRect.width / 2);
        
        // Clamp to container bounds
        if (left < 10) left = 10;
        if (left + tRect.width > cRect.width - 10) left = cRect.width - tRect.width - 10;
        if (top < 10) top = clientY - cRect.top + 40; // Flip to below if too close to top
        
        this.el.style.top = `${top}px`;
        this.el.style.left = `${left}px`;
    },
    hide() { if(this.el) this.el.classList.add('hidden'); }
};


export { TooltipMgr };
