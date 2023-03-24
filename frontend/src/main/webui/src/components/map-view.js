import { css, html, LitElement } from 'lit';

// This is only needed for single-point or row or column cases, and the exact value doesn't matter then
const defaultScaleFactor = 10000;

const width = 400;
const height = width * 0.75;

class MapView extends LitElement {
  static styles = css`
    .map {
      padding: 0;
      width: ${width}px;
      height: ${height}px;
      position: relative;
      margin: 80px;
    }

    .place {
      position: absolute;
    }

    .marker {
      width: 4px;
      height: 4px;
      transform: translateX(-2px) translateY(-2px);
      background-color: black;
    }

    .label {
      width: 100px; // an arbitrary width, so we can center in it
      text-align: center;
      transform: translateX(-50%) translateY(-120%);
    }
  `;

  static get properties() {
    return {
      places: {},
      scaleFactor: {},
      latitudeOffset: {},
      longitudeOffset: {},
      aspectRatio: {},
    };
  }

  render() {
    if (!this.places) {
      return html` <h2>Loading...</h2> `;
    }
    return html`
      <div class="map">
        ${this.places.map(entry => this.plot(entry))}
        </table>
      </div>
    `;
  }

  // Turns latitude and longitude into x and y (left and top) coordinates.
  transform(coord) {
    // Remember, latitude and longitude are the opposite order from x and y, so we *would* swap them
    // ... except that redis GEO format *already* swaps them!

    // We also need to shift our coordinate system from (0,0) being in bottom-left corner to (0,0) being in the top-left corner

    const x =
      (coord[0] - this.longitudeOffset) * this.scaleFactor * this.aspectRatio;
    const y = height - (coord[1] - this.latitudeOffset) * this.scaleFactor;

    return [x, y];
  }

  plot(place) {
    const coordinates = place.coordinates.split(',').map(n => parseFloat(n));
    const transformed = this.transform(coordinates);
    const x = transformed[0];
    const y = transformed[1];

    const position = `left:${x}px; top:${y}px`;
    return html` <div class="place" style=${position}>
      <div class="marker"></div>
      <div class="label">${place.name}</div>
    </div>`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.fetchData();
  }

  async fetchData() {
    const response = await fetch('http://localhost:8092/places/');
    const places = await response?.json();
    // NOTE! You would think the coordinates are latitude,longitude, but redis swaps those
    const latitudes = places.map(place => place.coordinates.split(',')[1]);
    const longitudes = places.map(place => place.coordinates.split(',')[0]);

    // How many degrees we expect the map to cover
    const minLatitude = Math.min(...latitudes);
    const minLongitude = Math.min(...longitudes);

    const latitudeRange = Math.max(...latitudes) - minLatitude;
    const longitudeRange = Math.max(...longitudes) - minLongitude;

    // This is simple equirectangular projection. The npm package proj4 would be more precise, but also harder
    // See https://stackoverflow.com/questions/16266809/convert-from-latitude-longitude-to-x-y for details
    // Convert degrees to radians
    const latitudeInRadians = (minLatitude / 180) * Math.PI;

    // This adjusts the up-and-down-squishedness of the map
    // We can use a geographically 'correct' value, or tune it to look good
    // No matter what value we set for this, the tests should still pass
    this.aspectRatio = Math.cos(latitudeInRadians);

    // check height and width both to make sure it fits
    this.scaleFactor = Math.min(
      longitudeRange > 0
        ? width / (longitudeRange * this.aspectRatio)
        : defaultScaleFactor,
      latitudeRange > 0 ? height / latitudeRange : defaultScaleFactor
    );

    const heightInDegrees = height / this.scaleFactor;
    const widthInDegrees = width / (this.scaleFactor * this.aspectRatio);

    this.latitudeOffset = minLatitude - (heightInDegrees - latitudeRange) / 2;
    this.longitudeOffset = minLongitude - (widthInDegrees - longitudeRange) / 2;

    this.places = places;
  }
}

// Custom elements have to have a hyphen in the name, even in cases like this, where it doesn't really make sense
customElements.define('map-view', MapView);
