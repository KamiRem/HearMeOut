import { CakeBase } from './CakeBase'

export function BrandIntro() {
  return (
    <section className="text-center lg:text-left" aria-labelledby="title">
      <p className="badge badge-primary badge-outline mb-6 px-3 py-3 text-xs tracking-wider uppercase">Le jeu des choix inattendus</p>
      <h1 id="title" className="text-6xl leading-[.9] font-black tracking-tighter sm:text-8xl lg:text-8xl">HEAR<br />ME <span className="text-primary">OUT.</span></h1>
      <p className="mx-auto mt-6 max-w-sm text-lg leading-relaxed text-base-content/80 lg:mx-0">Tes choix les plus difficiles à expliquer.<br />Tes amis pour les découvrir.</p>
      <div className="relative mx-auto hidden h-64 max-w-md lg:mx-0 lg:block" aria-hidden="true">
        <div className="reveal-cake origin-top scale-75">
          <CakeBase />
          <div className="brand-pick"><span>?</span></div>
          <div className="brand-pick"><span>!</span></div>
        </div>
      </div>
      <p className="mt-6 text-xs font-semibold tracking-widest text-base-content/65 uppercase lg:mt-0">2 à 12 amis · Aucun compte · Vos images</p>
    </section>
  )
}
