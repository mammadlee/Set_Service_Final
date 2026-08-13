import { SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '../../shared/components/PageHeader';

export function SystemSettingsPage() {
  return (
    <>
      <PageHeader
        title="Sistem parametrləri"
        description="Ümumi sistem sazlamaları üçün mərkəzləşdirilmiş bölmə."
      />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Parametrlər</h2>
            <p>Hazırda bu bölmə strukturlaşdırılıb. Yeni sistem sazlamaları burada toplanacaq.</p>
          </div>
          <SlidersHorizontal size={20} />
        </div>
        <p className="muted">Aktiv dəyişdirilə bilən sistem parametri yoxdur.</p>
      </section>
    </>
  );
}
