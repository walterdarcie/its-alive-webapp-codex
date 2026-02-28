import type { CSSProperties } from "react";

type BrandSvgProps = {
  style?: CSSProperties;
};

export function BrandIconSvg({ style }: BrandSvgProps) {
  return (
    <svg width="94" height="76" viewBox="0 0 94 76" fill="none" xmlns="http://www.w3.org/2000/svg" style={style}>
      <path
        d="M35.5684 35.1758C37.752 35.1759 39.6558 36.1839 40.8877 37.8076V45.9844C39.6558 47.6081 37.752 48.6161 35.5684 48.6162C31.9285 48.6162 28.8479 45.5923 28.8477 41.8965C28.8477 38.2005 31.9284 35.1758 35.5684 35.1758Z"
        fill="url(#brandIconPaint0)"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M32 8.46387C32 10.673 33.7909 12.4639 36 12.4639C38.2091 12.4639 40 10.673 40 8.46387V0H86C90.4183 0 94 3.58172 94 8V26C86 32 86 44 94 50V68C94 72.4183 90.4183 76 86 76H40V67.5C40 65.2909 38.2091 63.5 36 63.5C33.7909 63.5 32 65.2909 32 67.5V76H8C3.58172 76 1.61064e-07 72.4183 0 68V50C8 44 8 32 0 26V8C0 3.58172 3.58172 0 8 0H32V8.46387ZM34.3359 28.0078C27.896 28.0079 21.6797 34.2245 21.6797 41.8965C21.6799 49.5682 27.8961 55.7841 34.3359 55.7842C37.3038 55.7842 39.3757 54.8879 40.8877 53.376V55H48.0557V28.792H40.8877V30.4717C39.3757 28.9039 37.3037 28.0078 34.3359 28.0078Z"
        fill="url(#brandIconPaint1)"
      />
      <defs>
        <linearGradient id="brandIconPaint0" x1="94" y1="38" x2="0" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FC6767" />
          <stop offset="1" stopColor="#EC008C" />
        </linearGradient>
        <linearGradient id="brandIconPaint1" x1="94" y1="38" x2="0" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FC6767" />
          <stop offset="1" stopColor="#EC008C" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function BrandDefaultSvg({ style }: BrandSvgProps) {
  return (
    <svg width="198" height="76" viewBox="0 0 198 76" fill="none" xmlns="http://www.w3.org/2000/svg" style={style}>
      <path d="M9.96799 55H2.79999V28.792H9.96799V55ZM9.96799 26.272H2.79999V19.104H9.96799V26.272Z" fill="url(#brandDefaultPaint0)" />
      <path d="M27.5262 28.792V35.96H23.6062V55H16.4382V35.96H13.3022V28.792H16.4382V21.848L23.6062 18.488V28.792H27.5262Z" fill="url(#brandDefaultPaint1)" />
      <path d="M39.0854 21.512L31.4694 30.416V16.64H39.0854V21.512Z" fill="url(#brandDefaultPaint2)" />
      <path d="M52.1255 27.952L54.9255 34.504C43.1095 34.504 48.0375 55.504 32.8055 55.504L30.7335 48.616C42.4375 48.616 37.0615 27.952 52.1255 27.952Z" fill="url(#brandDefaultPaint3)" />
      <path
        d="M91.5683 35.1758C93.752 35.1759 95.6557 36.1839 96.8877 37.8076V45.9844C95.6557 47.6081 93.752 48.6161 91.5683 48.6162C87.9285 48.6162 84.8479 45.5923 84.8476 41.8965C84.8476 38.2005 87.9283 35.1758 91.5683 35.1758Z"
        fill="url(#brandDefaultPaint4)"
      />
      <path
        d="M165.619 35.1758C166.403 35.1758 167.244 35.344 167.972 35.624L159.348 44.3037C159.068 43.5759 158.899 42.7363 158.899 41.8965C158.899 38.1445 162.035 35.1758 165.619 35.1758Z"
        fill="url(#brandDefaultPaint5)"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M88 8.46387C88 10.673 89.7908 12.4639 92 12.4639C94.2091 12.4639 96 10.673 96 8.46387V0H190C194.418 0 198 3.58172 198 8V26C190 32 190 44 198 50V68C198 72.4183 194.418 76 190 76H96V67.5C96 65.2909 94.2091 63.5 92 63.5C89.7908 63.5 88 65.2909 88 67.5V76H64C59.5817 76 56 72.4183 56 68V50C64 44 64 32 56 26V8C56 3.58172 59.5817 0 64 0H88V8.46387ZM128.408 28.792L140.056 56.1758L151.704 28.792H143.92L140.056 38.2002L136.192 28.792H128.408ZM90.3359 28.0078C83.8959 28.0079 77.6797 34.2245 77.6797 41.8965C77.6799 49.5682 83.8961 55.7841 90.3359 55.7842C93.3038 55.7842 95.3757 54.8879 96.8877 53.376V55H104.056V28.792H96.8877V30.4717C95.3757 28.9039 93.3037 28.0078 90.3359 28.0078ZM165.619 28.0078C157.947 28.0079 151.731 34.5605 151.731 41.8965C151.732 49.6242 158.283 55.7841 165.619 55.7842C169.147 55.7842 172.675 54.4401 175.419 51.6963L170.379 46.6562C169.035 48 167.355 48.6162 165.619 48.6162C164.723 48.6162 163.939 48.448 163.211 48.168L177.211 34.168C176.651 33.3281 176.147 32.7677 175.419 32.0957C172.675 29.4079 169.147 28.0078 165.619 28.0078ZM108.523 16.6396V55H115.691V16.6396H108.523ZM120.145 28.792V55H127.313V28.792H120.145ZM120.145 19.1035V26.2725H127.313V19.1035H120.145Z"
        fill="url(#brandDefaultPaint6)"
      />
      <defs>
        <linearGradient id="brandDefaultPaint0" x1="198" y1="38" x2="2.79999" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FC6767" />
          <stop offset="1" stopColor="#EC008C" />
        </linearGradient>
        <linearGradient id="brandDefaultPaint1" x1="198" y1="38" x2="2.79999" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FC6767" />
          <stop offset="1" stopColor="#EC008C" />
        </linearGradient>
        <linearGradient id="brandDefaultPaint2" x1="198" y1="38" x2="2.79999" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FC6767" />
          <stop offset="1" stopColor="#EC008C" />
        </linearGradient>
        <linearGradient id="brandDefaultPaint3" x1="198" y1="38" x2="2.79999" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FC6767" />
          <stop offset="1" stopColor="#EC008C" />
        </linearGradient>
        <linearGradient id="brandDefaultPaint4" x1="198" y1="38" x2="2.79999" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FC6767" />
          <stop offset="1" stopColor="#EC008C" />
        </linearGradient>
        <linearGradient id="brandDefaultPaint5" x1="198" y1="38" x2="2.79999" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FC6767" />
          <stop offset="1" stopColor="#EC008C" />
        </linearGradient>
        <linearGradient id="brandDefaultPaint6" x1="198" y1="38" x2="2.79999" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FC6767" />
          <stop offset="1" stopColor="#EC008C" />
        </linearGradient>
      </defs>
    </svg>
  );
}
