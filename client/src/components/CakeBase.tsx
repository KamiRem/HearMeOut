// Shared decoration for the home hero and the synchronized reveal stage.
export function CakeBase() {
  return <>
    <div className="reveal-cake-plate" aria-hidden="true" />
    <div className="reveal-cake-body" aria-hidden="true"><span>hear me out</span></div>
    <div className="reveal-cake-icing" aria-hidden="true" />
  </>
}
