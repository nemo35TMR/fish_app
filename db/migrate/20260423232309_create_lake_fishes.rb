class CreateLakeFishes < ActiveRecord::Migration[8.1]
  def change
    create_table :lake_fishes do |t|
      t.references :lake, null: false, foreign_key: true
      t.references :fish_species, null: false, foreign_key: true

      t.timestamps
    end
  end
end
