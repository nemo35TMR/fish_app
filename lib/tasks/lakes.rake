# frozen_string_literal: true

namespace :lakes do
  desc "Importer / mettre à jour les lacs depuis db/data/canadian_lakes.geojson"
  task import_canada: :environment do
    path = Rails.root.join("db/data/canadian_lakes.geojson")
    raise "Fichier manquant : #{path}" unless File.exist?(path)

    n = Lakes::GeojsonImporter.import!(path)
    puts "#{n} lacs importés ou mis à jour."
  end
end
