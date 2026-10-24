import { StudentLayout } from '../StudentLayout'
import { PageTitle, Panel, formatDate, td, th } from '../../inst/ui/bits'
import { useConsent } from '../../verify/consent'

export default function Log() {
  const log = useConsent((s) => s.log)
  return (
    <StudentLayout>
      <PageTitle title="Access log" sub="Every request, decision and view of your record" />
      <Panel flush>
        <div className="overflow-x-auto">
          <table className="w-full text-[15px]">
            <thead className="border-b border-line bg-page/60"><tr><th className={th}>When</th><th className={th}>Who</th><th className={th}>What happened</th></tr></thead>
            <tbody className="divide-y divide-line">
              {log.map((e) => (
                <tr key={e.id}>
                  <td className={`${td} whitespace-nowrap text-sm text-muted`}>{formatDate(e.at)}</td>
                  <td className={`${td} font-medium`}>{e.actor}</td>
                  <td className={td}>{e.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </StudentLayout>
  )
}
