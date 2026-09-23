export function BrandIntro() {
  return (
    <section className="intro" aria-labelledby="title">
      <p className="eyebrow">Un gâteau. Vos choix les plus improbables.</p>
      <h1 id="title">HEAR<br />ME <span>OUT.</span></h1>
      <p className="description">Prépare tes meilleures justifications.<br />Le gâteau, lui, ne juge pas. Tes amis, peut-être.</p>
      <div className="cake" aria-hidden="true">
        <div className="cake-label">ÉCOUTEZ-MOI…</div>
        <div className="cake-stick" />
        <div className="cake-top" />
        <div className="cake-body" />
        <div className="cake-plate" />
      </div>
    </section>
  )
}
