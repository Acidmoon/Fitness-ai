# exercises-dataset import source

This folder stores the text/data portion of `hasaneyldrm/exercises-dataset`
used to seed the Fitness AI exercise catalog.

- Source repository: https://github.com/hasaneyldrm/exercises-dataset
- Source commit: `fdb2d48eb7e26f02afbabceea205b114a13e0414`
- Imported file: `data/exercises.json`
- License file: `LICENSE` copied from the upstream repository
- Imported records: 1,324
- Media policy: images and GIFs are not copied into this project. The upstream
  media is excluded from MIT license coverage and remains governed by Gym visual
  terms, so this project stores only attribution metadata until media use is
  separately reviewed.

The seed pipeline maps the upstream rows into `Exercise.standard` metadata for
catalog search, classification, campus candidate filtering, future
recommendation ranking, and AI support flags. It does not treat the upstream
instructions as pose-scoring standards.
