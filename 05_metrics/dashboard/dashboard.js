// ============================================
// TAPAU GTM — Dashboard JavaScript
// Handles: Section navigation, animations
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Section navigation
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.section');
    const pageTitle = document.getElementById('page-title');

    const sectionTitles = {
        overview: 'Overview',
        acquisition: 'Acquisition',
        activation: 'Activation',
        retention: 'Retention',
        scorecard: 'Readiness Scorecard'
    };

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.dataset.section;

            // Update active nav
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // Show target section
            sections.forEach(s => s.classList.add('hidden'));
            const targetSection = document.getElementById(`section-${target}`);
            if (targetSection) {
                targetSection.classList.remove('hidden');
                animateSection(targetSection);
            }

            // Update page title
            pageTitle.textContent = sectionTitles[target] || 'Dashboard';
        });
    });

    // Animate section on show
    function animateSection(section) {
        const elements = section.querySelectorAll('.kpi-card, .card, .scorecard-layer');
        elements.forEach((el, i) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(16px)';
            setTimeout(() => {
                el.style.transition = 'all 0.4s ease';
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            }, i * 60);
        });

        // Animate bars
        const bars = section.querySelectorAll('.kpi-bar-fill, .funnel-bar, .step-bar, .chart-bar-vertical');
        bars.forEach((bar, i) => {
            const targetWidth = bar.style.width || bar.style.height;
            if (bar.style.width) {
                bar.style.width = '0%';
                setTimeout(() => { bar.style.width = targetWidth; }, i * 40 + 200);
            }
            if (bar.classList.contains('chart-bar-vertical')) {
                const targetHeight = bar.style.height;
                bar.style.height = '0%';
                setTimeout(() => { bar.style.height = targetHeight; }, i * 60 + 200);
            }
        });
    }

    // Animate overview on load
    const overviewSection = document.getElementById('section-overview');
    if (overviewSection) {
        setTimeout(() => animateSection(overviewSection), 100);
    }

    // KPI value counter animation
    function animateValue(el, start, end, duration) {
        const startTime = performance.now();
        const isRM = el.textContent.includes('RM');
        const isPercent = el.textContent.includes('%');

        function update(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + (end - start) * eased);

            if (isRM) {
                el.textContent = `RM ${current.toLocaleString()}`;
            } else if (isPercent) {
                el.textContent = `${current}%`;
            } else {
                el.textContent = current.toLocaleString();
            }

            if (progress < 1) requestAnimationFrame(update);
        }
        requestAnimationFrame(update);
    }

    // Period selector (visual only for demo)
    const periodSelect = document.getElementById('period-select');
    const headerPeriod = document.querySelector('.header-period');

    const periodLabels = {
        '7d': 'Last 7 days · Mar 20–26, 2025',
        '14d': 'Last 14 days · Mar 13–26, 2025',
        '30d': 'Last 30 days · Feb 25 – Mar 26, 2025',
        'all': 'All time · Since Feb 24, 2025'
    };

    if (periodSelect) {
        periodSelect.addEventListener('change', (e) => {
            headerPeriod.textContent = periodLabels[e.target.value] || '';
            // Re-animate current section
            const activeSection = document.querySelector('.section:not(.hidden)');
            if (activeSection) animateSection(activeSection);
        });
    }
});
