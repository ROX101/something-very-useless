import { Link } from 'react-router-dom'
import { PublicLayout } from '../ui/PublicLayout'

export interface InfoContent { title: string; paragraphs: string[] }

export const INFO: Record<string, InfoContent> = {
  register: {
    title: 'Register an account',
    paragraphs: [
      'Institution accounts are created for the nodal officer registered on the AICTE approval portal. The nodal officer can then add data operators for the institution.',
      'AICTE staff accounts are issued by the AICTE IT Cell on an @aicte-india.org address.',
      'Students sign in with their APAAR ID. Employers and other verifying organisations register with their organisation details and declared purpose, and are approved before use.',
    ],
  },
  'forgot-password': {
    title: 'Forgot password',
    paragraphs: ['A password reset link will be sent to your registered email address or mobile number. If you no longer have access to either, contact your nodal officer or the helpdesk.'],
  },
  guidance: {
    title: 'User guidance',
    paragraphs: [
      'Sign in with your registered user ID. Your account determines your role and the services available to you.',
      'Institutions submit student enrolment data for each academic year. AICTE reviews submissions and compliance alerts. Students approve or refuse verification requests. Registered verifiers confirm the authenticity of academic credentials.',
    ],
  },
  help: {
    title: 'Help & support',
    paragraphs: ['For assistance with your account, submissions or verification requests, contact the APAAR helpdesk. Please keep your user ID ready when you get in touch.'],
  },
  about: {
    title: 'About APAAR',
    paragraphs: [
      'APAAR is a student data management and verification platform for AICTE-approved institutions, built on the APAAR ID as the unique academic identifier.',
      'It brings together institution submissions, automated validation, national monitoring and consent-based verification of academic records in one platform.',
    ],
  },
  privacy: {
    title: 'Privacy policy',
    paragraphs: ['Personal data is processed in accordance with the Digital Personal Data Protection Act, 2023. Data is used only for the stated purpose, shared with verifiers only with the student’s consent, and every access is logged.'],
  },
  terms: {
    title: 'Terms of use',
    paragraphs: ['Use of this platform is limited to authorised users for the purposes associated with their account. Sharing credentials or accessing data beyond your assigned role is not permitted.'],
  },
  accessibility: {
    title: 'Accessibility',
    paragraphs: ['This platform follows the Guidelines for Indian Government Websites (GIGW 3.0) and WCAG 2.1 Level AA, including adjustable text size, keyboard navigation, a skip-to-content link and a bilingual interface.'],
  },
}

export default function InfoPage({ id }: { id: keyof typeof INFO }) {
  const c = INFO[id]
  return (
    <PublicLayout crumb={c.title}>
      <article className="max-w-4xl border border-line bg-white p-8 md:p-10">
        <h1 className="font-serif text-3xl text-ink">{c.title}</h1>
        {c.paragraphs.map((p) => <p key={p} className="mt-4 leading-relaxed text-ink">{p}</p>)}
        <Link to="/" className="mt-8 inline-block text-sm font-semibold text-navy underline underline-offset-2">Back to sign in</Link>
      </article>
    </PublicLayout>
  )
}
